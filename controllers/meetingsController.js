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

// POST & PUT /api/meetings/:id/votes - 투표 생성 및 수정
exports.handleVote = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const meetingsCollection = db.collection("meetings");
    const { id } = req.params;
    // 요청 Body에서 participantId 대신 nickname, password를 받습니다.
    const { nickname, password, dateOptionIds } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "유효하지 않은 ID 형식입니다." });
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

    const meeting = await meetingsCollection.findOne({ _id: new ObjectId(id) });
    if (!meeting) {
      return res.status(404).json({ error: "해당 모임을 찾을 수 없습니다." });
    }

    // --- 참여자 인증 로직 시작 ---
    const participant = meeting.participants.find(
      (p) => p.nickname === nickname
    );
    if (!participant) {
      return res
        .status(403)
        .json({ error: "해당 닉네임의 참여자를 찾을 수 없습니다." });
    }

    const isMatch = await bcrypt.compare(password, participant.password);
    if (!isMatch) {
      return res.status(403).json({ error: "비밀번호가 일치하지 않습니다." });
    }
    // --- 참여자 인증 로직 끝 ---

    const participantId = participant._id; // 인증 성공 후, participantId를 사용

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
