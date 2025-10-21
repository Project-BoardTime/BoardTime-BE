// .env 파일의 환경 변수를 최상단에서 불러옵니다.
require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors"); // 1. cors 패키지를 불러옵니다.

// 라우터 파일들을 불러옵니다.
// const postRoutes = require("./routes/posts");
const meetingRoutes = require("./routes/meetings");

const app = express();
const port = process.env.PORT || 4000;
const uri = process.env.MONGO_URI;

// MongoDB 클라이언트 인스턴스를 생성합니다.
const client = new MongoClient(uri);

// 2. 허용할 출처(origin) 목록을 정의합니다.
const allowedOrigins = [
  "http://localhost:3000", // 로컬 프론트엔드 개발 서버 주소
  // 'https://boardtime-fe.vercel.app' // TODO: 나중에 프론트엔드 배포 후 실제 주소로 변경
];

// 3. CORS 옵션을 설정합니다.
const corsOptions = {
  origin: function (origin, callback) {
    // 요청 출처가 허용 목록에 있거나, 출처가 없는 경우(예: Postman) 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

async function run() {
  try {
    // MongoDB 데이터베이스에 연결합니다.
    await client.connect();
    console.log("✅ MongoDB에 성공적으로 연결되었습니다.");

    // 사용할 데이터베이스를 'boardtime'으로 지정합니다.
    const db = client.db("boardtime");
    app.locals.db = db;

    // 4. CORS 미들웨어를 모든 라우트보다 먼저 적용합니다.
    app.use(cors(corsOptions));

    // JSON 미들웨어 설정: 클라이언트 요청의 body를 json 형식으로 파싱해줍니다.
    app.use(express.json());

    // 기본 경로 라우트
    app.get("/", (req, res) => {
      res.send("BoardTime 백엔드 서버에 오신 것을 환영합니다.");
    });

    // API 라우트들을 미들웨어로 등록합니다.
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
