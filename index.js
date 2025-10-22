// .env 파일의 환경 변수를 최상단에서 불러옵니다.
require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors"); // cors 패키지를 불러옵니다.

// 라우터 파일들을 불러옵니다.
// const postRoutes = require("./routes/posts");
const meetingRoutes = require("./routes/meetings");

const app = express();
const port = process.env.PORT || 4000; // 사용자 설정 포트 기억
const uri = process.env.MONGO_URI;

// MongoDB 클라이언트 인스턴스를 생성합니다.
const client = new MongoClient(uri);

// 허용할 출처(origin) 목록을 정의합니다.
const allowedOrigins = [
  "http://localhost:3000", // 로컬 프론트엔드 개발 서버 주소
  // 'https://boardtime-fe.vercel.app' // TODO: 나중에 프론트엔드 배포 후 실제 주소로 변경
];

// CORS 옵션을 설정합니다.
const corsOptions = {
  origin: function (origin, callback) {
    console.log("CORS Check - Received Origin:", origin); // CORS 함수 내에서도 origin 값 확인
    // 요청 출처가 허용 목록에 있거나, 출처가 없는 경우(예: Postman, 서버 간 통신) 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      console.log("CORS Allowed for:", origin);
      callback(null, true);
    } else {
      console.log("CORS Blocked for:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // 허용할 HTTP 메서드 명시 (OPTIONS 해결에 도움)
  credentials: true, // 필요시 쿠키 허용
  optionsSuccessStatus: 204, // 일부 레거시 브라우저를 위해 필요
};

// --- OPTIONS 사전 요청 핸들러 추가 ---
// 모든 경로(*)에 대한 OPTIONS 요청을 먼저 처리하고 CORS 옵션을 적용합니다.
app.options("*", cors(corsOptions));
// --- OPTIONS 핸들러 추가 끝 ---

// --- 요청 로깅 미들웨어 ---
app.use((req, res, next) => {
  console.log("--- Request Received ---");
  console.log("Method:", req.method); // 요청 메서드 확인
  console.log("Origin Header:", req.headers.origin); // 요청의 Origin 헤더 값 출력
  next(); // 다음 미들웨어로 진행
});
// --- 로깅 미들웨어 끝 ---

async function run() {
  try {
    // MongoDB 데이터베이스에 연결합니다.
    await client.connect();
    console.log("✅ MongoDB에 성공적으로 연결되었습니다.");

    // 사용할 데이터베이스를 'boardtime'으로 지정합니다.
    const db = client.db("boardtime");
    app.locals.db = db;

    // CORS 미들웨어를 OPTIONS 핸들러와 로깅 미들웨어 *다음에* 적용합니다.
    app.use(cors(corsOptions));

    // JSON 미들웨어 설정
    app.use(express.json());

    // 기본 경로 라우트
    app.get("/", (req, res) => {
      res.send("BoardTime 백엔드 서버에 오신 것을 환영합니다.");
    });

    // API 라우트들을 미들웨어로 등록합니다.
    app.use("/api/meetings", meetingRoutes);

    // 지정된 포트에서 서버를 실행합니다.
    app.listen(port, () => {
      // 로컬 포트 번호가 4000번인 것을 반영하여 로그 수정
      console.log(`🚀 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    });
  } catch (err) {
    console.error("❗️ MongoDB 연결 또는 서버 실행 오류:", err);
  }
}

// run 함수를 실행하여 서버를 시작합니다.
run().catch(console.dir);
