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
      return res
        .status(400)
        .json({
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

module.exports = router;
