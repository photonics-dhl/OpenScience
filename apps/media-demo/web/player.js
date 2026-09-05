/* global document */
const video = document.querySelector('video');
const chapters = [...document.querySelectorAll('[data-time]')];
const error = document.querySelector('.error');
for (const button of chapters) button.addEventListener('click', async () => {
  video.currentTime = Number(button.dataset.time);
  try { await video.play(); } catch { /* Native controls remain available. */ }
});
video.addEventListener('error', () => { error.hidden = false; });
video.addEventListener('timeupdate', () => {
  const index = chapters.findLastIndex((button) => video.currentTime >= Number(button.dataset.time));
  chapters.forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
});
