import BlockedDate from '../models/BlockedDate.js';

/** True if the photographer has blocked this date/time (editing day, vacation, offline booking...). */
export async function isSlotBlocked(date, time) {
  const blocks = await BlockedDate.find({ date });
  return blocks.some((block) => block.blocksTime(time));
}
