USE sl_it;

CREATE TABLE IF NOT EXISTS sl_it_audit_log (
  audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_person_id VARCHAR(64) NULL,
  actor_email VARCHAR(255) NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ip VARCHAR(64) NULL,
  user_agent TEXT NULL,
  request_id VARCHAR(64) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_ticket_sequence (
  year INT NOT NULL PRIMARY KEY,
  last_number INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_category (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_subcategory (
  subcategory_id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_it_subcategory_category FOREIGN KEY (category_id) REFERENCES it_category(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_sla_policy (
  sla_policy_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category_id INT NULL,
  priority ENUM('P0','P1','P2','P3') NULL,
  first_response_minutes INT NOT NULL,
  resolution_minutes INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_it_sla_category FOREIGN KEY (category_id) REFERENCES it_category(category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_routing_rule (
  rule_id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  subcategory_id INT NULL,
  default_assignee_person_id VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_it_routing_category FOREIGN KEY (category_id) REFERENCES it_category(category_id),
  CONSTRAINT fk_it_routing_subcategory FOREIGN KEY (subcategory_id) REFERENCES it_subcategory(subcategory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_ticket (
  ticket_id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(32) NOT NULL UNIQUE,
  requester_person_id VARCHAR(64) NOT NULL,
  requester_email VARCHAR(255) NOT NULL,
  requester_name VARCHAR(255) NOT NULL,
  assignee_person_id VARCHAR(64) NULL,
  assignee_email VARCHAR(255) NULL,
  assignee_name VARCHAR(255) NULL,
  category_id INT NULL,
  subcategory_id INT NULL,
  priority ENUM('P0','P1','P2','P3') NOT NULL,
  impact ENUM('HIGH','MEDIUM','LOW') NOT NULL,
  urgency ENUM('HIGH','MEDIUM','LOW') NOT NULL,
  status ENUM('OPEN','TRIAGED','IN_PROGRESS','WAITING_ON_USER','RESOLVED','CLOSED','REOPENED') NOT NULL,
  subject VARCHAR(256) NOT NULL,
  description TEXT NOT NULL,
  sla_policy_id INT NULL,
  first_response_due_at DATETIME(6) NULL,
  resolution_due_at DATETIME(6) NULL,
  first_response_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  resolved_at DATETIME(6) NULL,
  closed_at DATETIME(6) NULL,
  reopened_at DATETIME(6) NULL,
  calendar_event_id VARCHAR(128) NULL,
  calendar_event_html_link VARCHAR(512) NULL,
  CONSTRAINT fk_it_ticket_category FOREIGN KEY (category_id) REFERENCES it_category(category_id),
  CONSTRAINT fk_it_ticket_subcategory FOREIGN KEY (subcategory_id) REFERENCES it_subcategory(subcategory_id),
  CONSTRAINT fk_it_ticket_sla FOREIGN KEY (sla_policy_id) REFERENCES it_sla_policy(sla_policy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_ticket_comment (
  comment_id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  author_person_id VARCHAR(64) NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_it_ticket_comment_ticket FOREIGN KEY (ticket_id) REFERENCES it_ticket(ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS it_ticket_attachment (
  attachment_id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  comment_id INT NULL,
  filename VARCHAR(256) NOT NULL,
  mime VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL,
  storage_type ENUM('drive','local','url') NOT NULL,
  storage_ref VARCHAR(512) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_it_attachment_ticket FOREIGN KEY (ticket_id) REFERENCES it_ticket(ticket_id),
  CONSTRAINT fk_it_attachment_comment FOREIGN KEY (comment_id) REFERENCES it_ticket_comment(comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
