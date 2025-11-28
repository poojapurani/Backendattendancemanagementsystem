const LoginAttempt = require("../models/LoginAttempt");

// delay rules
function getLoginDelay(count) {
  if (count <= 3) return 0;
  if (count === 4) return 30 * 1000;
  if (count === 5) return 60 * 1000;
  if (count === 6) return 5 * 60 * 1000;
  if (count === 7) return 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000; // 8+ → full-day lock
}

exports.checkLoginRateLimit = async (emp_id, user_id) => {
  if (!user_id) return { allowed: true };

  let record = await LoginAttempt.findByPk(user_id);

  if (!record) {
    await LoginAttempt.create({ user_id });
    return { allowed: true };
  }

  if (record.lock_until && new Date() < record.lock_until) {
    return {
      allowed: false,
      wait: Math.ceil((record.lock_until - new Date()) / 1000)
    };
  }

  return { allowed: true };
};

exports.handleFailedLogin = async (user_id) => {
  let r = await LoginAttempt.findByPk(user_id);

  if (!r) {
    return await LoginAttempt.create({ user_id, failed_attempts: 1 });
  }

  r.failed_attempts++;
  r.last_failed_at = new Date();

  const delay = getLoginDelay(r.failed_attempts);
  if (delay > 0) {
    r.lock_until = new Date(Date.now() + delay);
  }

  await r.save();
};

exports.resetLoginAttempts = async (user_id) => {
  await LoginAttempt.upsert({
    user_id,
    failed_attempts: 0,
    last_failed_at: null,
    lock_until: null,
  });
};

exports.getLoginDelay = getLoginDelay;