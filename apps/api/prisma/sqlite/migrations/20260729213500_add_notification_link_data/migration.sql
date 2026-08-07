-- Twin of Postgres migration 20260729213451_add_notification_link_data.
-- Where tapping a notification should take the recipient, stored on the row because a
-- retraction's absence is already deleted by the time anyone reads about it. Nullable, so
-- every existing notification stays valid and simply isn't tappable.
ALTER TABLE "Notification" ADD COLUMN "data" JSONB;
