-- Run once after the application-stage schema. Existing rows remain mission.create.
ALTER TABLE ai_v2_proposals ADD COLUMN kind TEXT NOT NULL DEFAULT 'mission.create' CHECK(kind IN ('mission.create','radar.create','radar.update','study.plan.create'));
