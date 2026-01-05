-- Ensure final_decision never inserts as NULL (guards legacy code paths)

DROP TRIGGER IF EXISTS rec_candidate_final_decision_default;
CREATE TRIGGER rec_candidate_final_decision_default
BEFORE INSERT ON rec_candidate
FOR EACH ROW
SET NEW.final_decision = COALESCE(NEW.final_decision, 'pending');
