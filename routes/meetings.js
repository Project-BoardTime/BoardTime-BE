const express = require("express");
const { ObjectId } = require("mongodb"); // ObjectId를 사용하기 위해 불러옵니다.
const router = express.Router();

// POST /api/meetings - 새로운 모임 생성
router.post("/", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");

    // 1. 클라이언트로부터 데이터 받아오기
    const {
      title,
      description,
      placeName,
      placeLat,
      placeLng,
      password,
      deadline,
      dateOptions,
    } = req.body;

    // 2. 필수 데이터 유효성 검사
    if (!title || !password || !dateOptions || dateOptions.length === 0) {
      return res.status(400).json({
        error: "필수 항목(제목, 비밀번호, 날짜 옵션)이 누락되었습니다.",
      });
    }

    // 3. 데이터베이스에 저장할 문서(document) 생성
    const newMeeting = {
      title,
      description,
      place: {
        // 장소 정보를 객체로 묶어 저장
        name: placeName,
        lat: placeLat,
        lng: placeLng,
      },
      password, // 실제 프로젝트에서는 비밀번호를 암호화해서 저장해야 합니다.
      deadline: new Date(deadline),
      // 날짜 옵션 배열을 객체 배열로 변환 (각 옵션에 고유 ID 부여)
      dateOptions: dateOptions.map((dateStr) => ({
        _id: new ObjectId(), // 각 날짜 옵션에 고유 ID 생성
        date: new Date(dateStr),
        votes: [], // 초기 투표자 배열은 비워둠
      })),
      participants: [], // 초기 참여자 배열은 비워둠
      createdAt: new Date(),
    };

    // 4. 데이터베이스에 삽입
    const result = await meetingsCollection.insertOne(newMeeting);

    // 5. 성공 응답 보내기 (생성된 모임의 ID)
    res.status(201).json({ meetingId: result.insertedId });
  } catch (error) {
    console.error("모임 생성 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// POST /api/meetings/:id/participants - 특정 모임에 새로운 참여자 추가
router.post("/:id/participants", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");

    const { id } = req.params;
    const { nickname, password } = req.body;

    // 1. 유효성 검사
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ error: "유효하지 않은 모임 ID 형식입니다." });
    }
    if (!nickname || !password) {
      return res.status(400).json({ error: "닉네임과 비밀번호는 필수입니다." });
    }

    const newParticipant = {
      _id: new ObjectId(), // 참여자에게도 고유 ID 부여
      nickname,
      password, // 실제로는 암호화 필요
      // votes: [] // 투표 정보를 여기에 저장할 수도 있습니다.
    };

    // 2. DB 업데이트: 'participants' 배열에 새로운 참여자 추가
    const result = await meetingsCollection.updateOne(
      { _id: new ObjectId(id) }, // ID가 일치하는 모임을 찾아서
      { $push: { participants: newParticipant } } // participants 배열에 newParticipant를 추가
    );

    // 3. 업데이트가 실패한 경우 (해당 ID의 모임이 없음)
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 4. 성공 응답 (새로운 참여자의 ID 반환)
    res.status(201).json({ participantId: newParticipant._id });
  } catch (error) {
    console.error("참여자 추가 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// GET /api/meetings/:id - 특정 모임 상세 조회
router.get("/:id", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");

    // 1. URL 파라미터에서 모임 ID 가져오기
    const { id } = req.params;

    // 2. ID 형식 검사
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }

    // 3. 데이터베이스에서 해당 ID를 가진 모임 찾기
    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });

    // 4. 모임이 존재하지 않는 경우
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 5. 모임 정보 응답
    res.status(200).json(meeting);
  } catch (error) {
    console.error("모임 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

const voteHandler = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");

    const { id } = req.params;
    const { participantId, dateOptionIds } = req.body;

    if (!ObjectId.isValid(id) || !ObjectId.isValid(participantId)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }
    if (!dateOptionIds || !Array.isArray(dateOptionIds)) {
      return res
        .status(400)
        .json({ error: "날짜 선택(dateOptionIds)은 배열 형태여야 합니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $pull: { "dateOptions.$[].votes": new ObjectId(participantId) } }
    );

    const result = await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $addToSet: { "dateOptions.$[elem].votes": new ObjectId(participantId) },
      },
      {
        arrayFilters: [
          {
            "elem._id": {
              $in: dateOptionIds.map((optId) => new ObjectId(optId)),
            },
          },
        ],
      }
    );

    if (
      result.modifiedCount === 0 &&
      result.matchedCount === 0 &&
      dateOptionIds.length > 0
    ) {
      return res.status(404).json({ error: "투표할 날짜를 찾을 수 없습니다." });
    }

    // 요청 메서드에 따라 다른 메시지를 보낼 수 있습니다.
    const message =
      req.method === "POST"
        ? "투표가 성공적으로 저장되었습니다."
        : "투표가 성공적으로 수정되었습니다.";
    res.status(200).json({ message });
  } catch (error) {
    console.error("투표 처리 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// POST /api/meetings/:id/votes - 특정 모임에 투표하기
router.post("/:id/votes", voteHandler);

// PUT /api/meetings/:id/votes - 특정 모임 투표 수정하기
router.put("/:id/votes", voteHandler);

// GET /api/meetings/:id/votes - 날짜별 투표 결과 조회
router.get("/:id/votes", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });

    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 투표 결과를 담을 객체 생성
    const voteResults = {};

    // 각 날짜 옵션을 순회하며 투표자 수를 계산
    meeting.dateOptions.forEach((option) => {
      // Key: 날짜 옵션의 _id, Value: votes 배열의 길이 (투표자 수)
      voteResults[option._id] = option.votes.length;
    });

    res.status(200).json(voteResults);
  } catch (error) {
    console.error("투표 결과 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// GET /api/meetings/:id/votes/:dateOptionId - 특정 날짜에 투표한 참여자 목록 조회
router.get("/:id/votes/:dateOptionId", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id, dateOptionId } = req.params;

    if (!ObjectId.isValid(id) || !ObjectId.isValid(dateOptionId)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });

    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 해당 날짜 옵션 찾기
    const targetOption = meeting.dateOptions.find(
      (option) => option._id.toString() === dateOptionId
    );

    if (!targetOption) {
      return res
        .status(404)
        .json({ error: "해당 날짜 옵션을 찾을 수 없습니다." });
    }

    // 투표한 참여자들의 ID 목록
    const voterIds = targetOption.votes;

    // 전체 참여자 목록에서 투표한 참여자들의 정보만 필터링
    const votersInfo = meeting.participants
      .filter((participant) =>
        voterIds.some((voterId) => voterId.equals(participant._id))
      )
      .map((participant) => ({
        participantId: participant._id,
        nickname: participant.nickname,
      }));

    res.status(200).json(votersInfo);
  } catch (error) {
    console.error("참여자 목록 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// DELETE /api/meetings/:id - 특정 모임 삭제
// 요청 Body에 password를 추가로 받습니다.
router.delete("/:id", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { password } = req.body; // 요청 Body에서 비밀번호를 받음

    if (!password) {
      return res
        .status(401)
        .json({ error: "삭제 권한 확인을 위해 비밀번호가 필요합니다." });
    }

    // DB에서 해당 모임을 찾음
    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });

    if (!meeting) {
      return res.status(404).json({ error: "삭제할 모임을 찾을 수 없습니다." });
    }

    // **비밀번호 확인 절차 추가**
    if (meeting.password !== password) {
      return res
        .status(403)
        .json({ error: "비밀번호가 일치하지 않아 삭제할 수 없습니다." });
    }

    // 비밀번호가 일치하면 삭제 실행
    await meetingsCollection.deleteOne({ _id: new ObjectId(id) });

    res.status(200).json({ message: "모임이 성공적으로 삭제되었습니다." });
  } catch (error) {
    // ... 에러 처리
  }
});

// PUT /api/meetings/:id - 특정 모임 정보 수정
router.put("/:id", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { password, title, description, deadline } = req.body; // 수정할 정보와 비밀번호를 받음

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }
    if (!password) {
      return res
        .status(401)
        .json({ error: "수정 권한 확인을 위해 비밀번호가 필요합니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "수정할 모임을 찾을 수 없습니다." });
    }

    // 비밀번호 확인
    if (meeting.password !== password) {
      return res
        .status(403)
        .json({ error: "비밀번호가 일치하지 않아 수정할 수 없습니다." });
    }

    // 업데이트할 내용만 객체로 구성
    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (deadline) updates.deadline = new Date(deadline);

    // 업데이트할 내용이 없으면 아무것도 하지 않음
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "수정할 내용이 없습니다." });
    }

    // DB 업데이트
    const result = await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    res.status(200).json({ message: "모임 정보가 성공적으로 수정되었습니다." });
  } catch (error) {
    console.error("모임 수정 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

module.exports = router;
