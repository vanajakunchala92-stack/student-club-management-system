CREATE DATABASE IF NOT EXISTS scem_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE scem_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','coordinator','admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shared dashboard data: one current version of clubs/events and stalls for every device.
CREATE TABLE IF NOT EXISTS app_state (
  state_key VARCHAR(40) PRIMARY KEY,
  state_json JSON NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_state_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- One row per event registration; payload keeps all fields from the existing receipt form.
CREATE TABLE IF NOT EXISTS event_registrations (
  id VARCHAR(40) PRIMARY KEY,
  user_id INT NOT NULL,
  club_name VARCHAR(150) NOT NULL,
  event_name VARCHAR(150) NOT NULL,
  registration_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_registration_user (user_id),
  INDEX idx_registration_club_event (club_name, event_name),
  CONSTRAINT fk_registration_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
