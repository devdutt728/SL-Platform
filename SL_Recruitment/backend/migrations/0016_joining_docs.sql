CREATE TABLE IF NOT EXISTS rec_candidate_joining_doc (
    joining_doc_id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_id VARCHAR(128) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NULL,
    uploaded_by VARCHAR(20) NOT NULL,
    uploaded_by_person_id_platform INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_joining_doc_candidate (candidate_id),
    INDEX idx_joining_doc_type (doc_type),
    CONSTRAINT fk_joining_doc_candidate
        FOREIGN KEY (candidate_id) REFERENCES rec_candidate(candidate_id)
        ON DELETE CASCADE
);
