-- Postgres migration for the student-connection path.
-- PGlite executes this same file. Triggers are the backstop for invitation
-- decisions and for messages sent before an invitation is accepted.

CREATE TABLE schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invite_codes (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  batch text NOT NULL,
  max_uses integer NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_codes_uses_check CHECK (max_uses > 0 AND used_count >= 0 AND used_count <= max_uses)
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  invite_code_id uuid NOT NULL REFERENCES invite_codes (id),
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind text NOT NULL,
  version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  CONSTRAINT consents_kind_check CHECK (kind IN ('privacy', 'test_participation', 'age_18'))
);

CREATE TABLE profiles (
  account_id uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  school text NOT NULL,
  major text NOT NULL,
  stage text NOT NULL,
  public_bio text NOT NULL DEFAULT '',
  private_note text NOT NULL DEFAULT '',
  willing_to_help boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_stage_check CHECK (stage IN ('行前准备', '在读', '校友'))
);

CREATE TABLE communities (
  id uuid PRIMARY KEY,
  school text NOT NULL,
  major text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_school_major_unique UNIQUE (school, major)
);

CREATE TABLE questions (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES communities (id),
  author_id uuid NOT NULL REFERENCES accounts (id),
  title text NOT NULL,
  body text NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE answers (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES accounts (id),
  body text NOT NULL,
  helpful boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  from_account_id uuid NOT NULL REFERENCES accounts (id),
  to_account_id uuid NOT NULL REFERENCES accounts (id),
  note text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT invitations_not_self CHECK (from_account_id <> to_account_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  invitation_id uuid NOT NULL REFERENCES invitations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES accounts (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_school_major_idx ON profiles (school, major);
CREATE INDEX questions_community_idx ON questions (community_id, created_at);
CREATE INDEX invitations_to_idx ON invitations (to_account_id, status);
CREATE INDEX messages_invitation_idx ON messages (invitation_id, created_at);
CREATE INDEX notifications_account_idx ON notifications (account_id, created_at);

CREATE OR REPLACE FUNCTION invitations_freeze_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'invitation_decision_frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invitations_freeze_decision
BEFORE UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION invitations_freeze_decision();

CREATE OR REPLACE FUNCTION messages_require_accepted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inv_status text;
  inv_from uuid;
  inv_to uuid;
BEGIN
  SELECT status, from_account_id, to_account_id
    INTO inv_status, inv_from, inv_to
  FROM invitations
  WHERE id = NEW.invitation_id;
  IF inv_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'messages_require_acceptance' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.sender_id IS DISTINCT FROM inv_from AND NEW.sender_id IS DISTINCT FROM inv_to THEN
    RAISE EXCEPTION 'message_sender_not_participant' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_require_accepted
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION messages_require_accepted();
