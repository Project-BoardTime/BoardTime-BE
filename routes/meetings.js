const express = require("express");
const router = express.Router();
const meetingsController = require("../controllers/meetingsController");

// C(Create)
router.post("/", meetingsController.createMeeting);
router.post("/:id/participants", meetingsController.addParticipant);

// R(Read)
router.get("/search", meetingsController.searchMeetings);
router.post("/:id/auth", meetingsController.authenticateCreator);
router.get("/:id", meetingsController.getMeetingDetails);
router.get("/:id/votes", meetingsController.getVoteResults);
router.get("/:id/votes/:dateOptionId", meetingsController.getVotersForDate);

// U(Update)
router.put("/:id", meetingsController.updateMeeting);
router.post("/:id/votes", meetingsController.handleVote); // 투표 생성과 수정 분리 시 수정 필요
router.put("/:id/votes", meetingsController.handleVote); // 현재 POST와 PUT이 같은 로직 공유

// D(Delete)
router.delete("/:id", meetingsController.deleteMeeting);

module.exports = router;
