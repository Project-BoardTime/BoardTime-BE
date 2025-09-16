// .env 파일의 환경 변수를 최상단에서 불러옵니다.
require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");

// 라우터 파일들을 불러옵니다.
// const postRoutes = require("./routes/posts");
const meetingRoutes = require("./routes/meetings");

const app = express();
const port = process.env.PORT || 4000;
const uri = process.env.MONGO_URI;

// MongoDB 클라이언트 인스턴스를 생성합니다.
const client = new MongoClient(uri);

async function run() {
  try {
    // MongoDB 데이터베이스에 연결합니다.
    await client.connect();
    console.log("✅ MongoDB에 성공적으로 연결되었습니다.");

    // 사용할 데이터베이스를 'boardtime'으로 지정합니다.
    const db = client.db("boardtime");

    // db 객체를 app 전체에서 사용할 수 있도록 app.locals에 저장합니다.
    // 이렇게 하면 다른 라우터 파일에서 req.app.locals.db로 접근할 수 있습니다.
    app.locals.db = db;

    // JSON 미들웨어 설정: 클라이언트 요청의 body를 json 형식으로 파싱해줍니다.
    app.use(express.json());

    // 기본 경로 라우트
    app.get("/", (req, res) => {
      res.send("BoardTime 백엔드 서버에 오신 것을 환영합니다.");
    });

    // API 라우트들을 미들웨어로 등록합니다.
    // '/api/posts' 경로로 들어오는 모든 요청은 postRoutes가 처리합니다.
    // app.use("/api/posts", postRoutes);

    // '/api/meetings' 경로로 들어오는 모든 요청은 meetingRoutes가 처리합니다.
    app.use("/api/meetings", meetingRoutes);

    // 지정된 포트에서 서버를 실행합니다.
    app.listen(port, () => {
      console.log(`🚀 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    });
  } catch (err) {
    console.error("❗️ MongoDB 연결 또는 서버 실행 오류:", err);
  }
}

// run 함수를 실행하여 서버를 시작합니다.
run().catch(console.dir);
