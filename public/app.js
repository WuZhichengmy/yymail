'use strict';

const scene = document.querySelector('.scene');
const door = document.querySelector('.door-zone');
const feedbackDuration = { mailbox: 1100, box: 1000, stall: 1500 };
const timers = new Map();

door.addEventListener('click', () => {
  const isOpen = door.classList.toggle('is-open');
  door.setAttribute('aria-expanded', String(isOpen));
  door.setAttribute('aria-label', isOpen ? '关闭杂货铺的门' : '打开杂货铺的门');
});

function playFeedback(button) {
  if (timers.has(button)) return;
  button.classList.add('is-active');
  timers.set(button, setTimeout(() => {
    button.classList.remove('is-active');
    timers.delete(button);
  }, feedbackDuration[button.dataset.object]));
}

document.querySelectorAll('[data-object]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') playFeedback(button);
  });
  // Native buttons produce detail === 0 for keyboard / assistive activation.
  button.addEventListener('click', (event) => {
    if (event.detail === 0) playFeedback(button);
  });
});

function pauseScene() {
  scene.classList.add('is-paused');
  timers.forEach((timer, button) => {
    clearTimeout(timer);
    button.classList.remove('is-active');
  });
  timers.clear();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseScene();
  else scene.classList.remove('is-paused');
});
window.addEventListener('pagehide', pauseScene);
window.addEventListener('pageshow', () => {
  scene.classList.toggle('is-paused', document.hidden);
});
