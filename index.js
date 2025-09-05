// .env 파일의 환경 변수를 불러옵니다.
require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const port = process.env.PORT || 3001;

// .env 파일에서 MongoDB 연결 URI를 가져옵니다.
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function run() {
  try {
    // 데이터베이스에 연결합니다.
    await client.connect();
    console.log("✅ MongoDB에 성공적으로 연결되었습니다.");

    // 서버의 기본 경로(/)로 GET 요청이 오면 메시지를 응답합니다.
    app.get("/", (req, res) => {
      res.send("BoardTime 백엔드 서버");
    });

    // 지정된 포트에서 서버를 실행합니다.
    app.listen(port, () => {
      console.log(`🚀 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    });
  } catch (err) {
    console.error("❗️ MongoDB 연결 오류:", err);
  }
}

run().catch(console.dir);
