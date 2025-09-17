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

module.exports = router;
