const { ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");

// 비밀번호 해싱을 위한 'salt rounds' 설정. 숫자가 높을수록 보안이 강해지지만 처리 시간이 길어짐.
const saltRounds = 10;

// POST /api/meetings - 새로운 모임 생성
exports.createMeeting = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
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

    if (!title || !password || !dateOptions || !dateOptions.length) {
      return res.status(400).json({
        error: "필수 항목(제목, 비밀번호, 날짜 옵션)이 누락되었습니다.",
      });
    }

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newMeeting = {
      title,
      description,
      place: { name: placeName, lat: placeLat, lng: placeLng },
      password: hashedPassword, // 암호화된 비밀번호 저장
      deadline: new Date(deadline),
      dateOptions: dateOptions.map((dateStr) => ({
        _id: new ObjectId(),
        date: new Date(dateStr),
        votes: [],
      })),
      participants: [],
      createdAt: new Date(),
    };

    const result = await meetingsCollection.insertOne(newMeeting);
    res.status(201).json({ meetingId: result.insertedId });
  } catch (error) {
    console.error("모임 생성 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// GET /api/meetings/:id - 특정 모임 상세 조회
exports.getMeetingDetails = async (req, res) => {
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

    // --- 마감 여부 확인 로직 시작 ---
    const now = new Date();
    const deadline = new Date(meeting.deadline);
    const isExpired = now > deadline;
    // --- 마감 여부 확인 로직 끝 ---

    // 응답 데이터에 isExpired 필드 추가
    const responseData = {
      ...meeting,
      isExpired,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("모임 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// POST /api/meetings/:id/participants - 참여자 추가
exports.addParticipant = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { nickname, password } = req.body;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ error: "유효하지 않은 모임 ID 형식입니다." });
    }
    if (!nickname || !password) {
      return res.status(400).json({ error: "닉네임과 비밀번호는 필수입니다." });
    }

    // --- 닉네임 중복 확인 로직 시작 ---
    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    const isNicknameTaken = meeting.participants.some(
      (participant) => participant.nickname === nickname
    );
    if (isNicknameTaken) {
      return res.status(409).json({ error: "이미 사용 중인 닉네임입니다." });
    }
    // --- 닉네임 중복 확인 로직 끝 ---

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newParticipant = {
      _id: new ObjectId(),
      nickname,
      password: hashedPassword,
    };

    await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $push: { participants: newParticipant } }
    );

    res.status(201).json({ participantId: newParticipant._id });
  } catch (error) {
    console.error("참여자 추가 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// POST & PUT /api/meetings/:id/votes - 투표 생성 및 수정 (자동 참여 등록 포함)
exports.handleVote = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { nickname, password, dateOptionIds } = req.body;

    // 1. 기본 유효성 검사
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ error: "유효하지 않은 모임 ID 형식입니다." });
    }
    if (
      !nickname ||
      !password ||
      !dateOptionIds ||
      !Array.isArray(dateOptionIds)
    ) {
      return res
        .status(400)
        .json({ error: "닉네임, 비밀번호, 날짜 선택은 필수입니다." });
    }

    // 2. 모임 정보 가져오기
    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 3. 참여자 찾기 또는 생성 & 인증
    let participantId;
    let participant = meeting.participants.find((p) => p.nickname === nickname);

    if (participant) {
      // --- 기존 참여자인 경우: 비밀번호 인증 ---
      const isMatch = await bcrypt.compare(password, participant.password);
      if (!isMatch) {
        // 비밀번호가 틀리면 에러 반환
        return res.status(403).json({
          error:
            "비밀번호가 일치하지 않습니다. 기존 참여자는 정확한 비밀번호를 입력해주세요.",
        });
      }
      participantId = participant._id; // 기존 참여자 ID 사용
    } else {
      // --- 새로운 참여자인 경우: 자동 등록 ---
      // (혹시 모를 동시 요청 대비) 닉네임 중복 재확인
      const isNicknameTaken = meeting.participants.some(
        (p) => p.nickname === nickname
      );
      if (isNicknameTaken) {
        return res.status(409).json({ error: "이미 사용 중인 닉네임입니다." });
      }

      // 새 참여자 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      // 새 참여자 객체 생성 (새 ObjectId 부여)
      const newParticipant = {
        _id: new ObjectId(),
        nickname,
        password: hashedPassword,
      };

      // DB 업데이트: participants 배열에 새 참여자 추가
      await meetingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { participants: newParticipant } }
      );
      participantId = newParticipant._id; // 새 참여자 ID 사용
      console.log(`새 참여자 등록됨: ${nickname}`); // (선택적) 로그 기록
    }

    // --- 4. 투표 처리 (결정된 participantId 사용) ---

    // (초기화) 먼저 모든 날짜 옵션에서 해당 참여자의 투표 기록 삭제
    await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $pull: { "dateOptions.$[].votes": new ObjectId(participantId) } }
    );

    // (추가) 선택된 날짜 옵션들의 votes 배열에 참여자 ID 추가
    const result = await meetingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $addToSet: { "dateOptions.$[elem].votes": new ObjectId(participantId) },
      },
      // arrayFilters를 사용하여 선택된 날짜 옵션(_id 기준)만 업데이트
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

    // (선택적) 업데이트 결과 확인
    if (
      result.modifiedCount === 0 &&
      result.matchedCount === 0 &&
      dateOptionIds.length > 0
    ) {
      console.warn(
        `투표 업데이트 경고: 유효하지 않은 날짜 옵션 ID일 수 있습니다. Meeting ID: ${id}, Options: ${dateOptionIds.join(
          ","
        )}`
      );
      // 필요하다면 여기서 404 에러를 반환할 수도 있음
    }

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

// GET /api/meetings/:id/votes - 날짜별 투표 결과 조회
exports.getVoteResults = async (req, res) => {
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

    const voteResults = {};
    meeting.dateOptions.forEach((option) => {
      voteResults[option._id] = option.votes.length;
    });
    res.status(200).json(voteResults);
  } catch (error) {
    console.error("투표 결과 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// GET /api/meetings/:id/votes/:dateOptionId - 특정 날짜 투표 참여자 목록 조회
exports.getVotersForDate = async (req, res) => {
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

    const targetOption = meeting.dateOptions.find(
      (option) => option._id.toString() === dateOptionId
    );
    if (!targetOption) {
      return res
        .status(404)
        .json({ error: "해당 날짜 옵션을 찾을 수 없습니다." });
    }

    const voterIds = targetOption.votes;
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
};

// PUT /api/meetings/:id - 모임 정보 수정
exports.updateMeeting = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { password, title, description, deadline } = req.body;

    if (!password) {
      return res
        .status(401)
        .json({ error: "수정 권한 확인을 위해 비밀번호가 필요합니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "수정할 모임을 찾을 수 없습니다." });
    }

    // 비밀번호 비교
    const isMatch = await bcrypt.compare(password, meeting.password);
    if (!isMatch) {
      return res
        .status(403)
        .json({ error: "비밀번호가 일치하지 않아 수정할 수 없습니다." });
    }

    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (deadline) updates.deadline = new Date(deadline);

    if (Object.keys(updates).length > 0) {
      await meetingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
    }

    res.status(200).json({ message: "모임 정보가 성공적으로 수정되었습니다." });
  } catch (error) {
    console.error("모임 수정 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// DELETE /api/meetings/:id - 모임 삭제
exports.deleteMeeting = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res
        .status(401)
        .json({ error: "삭제 권한 확인을 위해 비밀번호가 필요합니다." });
    }

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "삭제할 모임을 찾을 수 없습니다." });
    }

    // 비밀번호 비교
    const isMatch = await bcrypt.compare(password, meeting.password);
    if (!isMatch) {
      return res
        .status(403)
        .json({ error: "비밀번호가 일치하지 않아 삭제할 수 없습니다." });
    }

    await meetingsCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json({ message: "모임이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("모임 삭제 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// GET /api/meetings/search - 모임 검색
exports.searchMeetings = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");

    // 1. 쿼리 파라미터에서 검색어(title)를 가져옵니다.
    const { title } = req.query;

    if (!title) {
      return res.status(400).json({ error: "검색어(title)를 입력해주세요." });
    }

    // 2. 대소문자 구분을 안 하는 정규식으로 검색 쿼리 생성
    const query = { title: new RegExp(title, "i") };

    // 3. DB에서 일치하는 모든 모임을 찾고, password 필드는 제외하고 반환
    const meetings = await meetingsCollection
      .find(query, { projection: { password: 0 } })
      .toArray();

    res.status(200).json(meetings);
  } catch (error) {
    console.error("모임 검색 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};

// POST /api/meetings/:id/auth - 생성자 비밀번호 인증
exports.authenticateCreator = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    const { password } = req.body; // 요청 Body에서 비밀번호 받기

    // 1. 유효성 검사
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
    }
    if (!password) {
      return res.status(401).json({ error: "비밀번호를 입력해주세요." });
    }

    // 2. 모임 찾기
    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // 3. 비밀번호 비교
    const isMatch = await bcrypt.compare(password, meeting.password);
    if (!isMatch) {
      // 비밀번호 불일치 시 401 Unauthorized 반환
      return res.status(401).json({ error: "비밀번호가 일치하지 않습니다." });
    }

    // 4. 인증 성공
    res.status(200).json({ message: "인증 성공" });
  } catch (error) {
    console.error("생성자 인증 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};
