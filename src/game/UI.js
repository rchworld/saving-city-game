const ITEM_LABELS = { arrow: '화살', shield: '방패', star: '별', sword: '칼' };

export class UI {
  constructor() {
    this.healthBar = document.getElementById('health-bar');
    this.monsterCount = document.getElementById('monster-count');
    this.bossTimer = document.getElementById('boss-timer');
    this.toastEl = document.getElementById('toast');
    this.slots = Array.from(document.querySelectorAll('.slot'));
    this.startOverlay = document.getElementById('start-overlay');
    this.endOverlay = document.getElementById('end-overlay');
    this.endTitle = document.getElementById('end-title');
    this.endDesc = document.getElementById('end-desc');
    this.rescueCount = document.getElementById('rescue-count');
    this.dangerWarning = document.getElementById('danger-warning');
    this.dangerBar = document.getElementById('danger-bar');
    this._toastTimer = null;
  }

  onStart(cb) {
    document.getElementById('start-btn').addEventListener('click', cb);
  }

  onRestart(cb) {
    document.getElementById('restart-btn').addEventListener('click', cb);
  }

  hideStart() {
    this.startOverlay.classList.add('hidden');
  }

  showEnd(won, reason = 'buildings') {
    this.endOverlay.classList.remove('hidden');
    if (won) {
      this.endTitle.textContent = '도시를 지켜냈다!';
      this.endTitle.style.color = '#66d97a';
      this.endDesc.textContent = '50마리의 괴수를 모두 물리쳤습니다. 잠실의 영웅이 되었습니다.';
    } else if (reason === 'river') {
      this.endTitle.textContent = '한강에 빠지고 말았다...';
      this.endTitle.style.color = '#64b5f6';
      this.endDesc.textContent = '3초 안에 별을 써서 탈출하지 못했습니다. 처음부터 다시 시작합니다.';
    } else {
      this.endTitle.textContent = '도시가 무너졌다...';
      this.endTitle.style.color = '#ff5252';
      this.endDesc.textContent = '롯데타워, 장미아파트, 향군타워, 삼성 CDS타워가 모두 재가 되었습니다.';
    }
  }

  hideEnd() {
    this.endOverlay.classList.add('hidden');
  }

  setHealth(hp, maxHp) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    this.healthBar.style.width = `${pct}%`;
    if (pct < 25) this.healthBar.style.background = '#ff5252';
    else if (pct < 55) this.healthBar.style.background = 'linear-gradient(90deg,#ffb300,#ffd54f)';
    else this.healthBar.style.background = 'linear-gradient(90deg,#4caf50,#8bc34a)';
  }

  setMonsterCount(n) {
    this.monsterCount.textContent = n;
  }

  setBossTimer(state, progress01) {
    // progress01: 0 = just fired / idle countdown just started, 1 = about to fire
    this.bossTimer.style.width = `${Math.max(0, Math.min(100, progress01 * 100))}%`;
    this.bossTimer.style.background = state === 'firing'
      ? 'linear-gradient(90deg,#ff0000,#ff5252)'
      : state === 'telegraph'
        ? 'linear-gradient(90deg,#ff9800,#ffca28)'
        : 'linear-gradient(90deg,#ff5252,#ff9800)';
  }

  updateInventory(bag, held) {
    for (const slot of this.slots) {
      const type = slot.dataset.type;
      slot.querySelector('.count').textContent = bag[type];
      slot.classList.toggle('equipped', held === type);
    }
  }

  setRescueCount(n, total) {
    this.rescueCount.textContent = `${n}/${total}`;
  }

  showDanger() {
    this.dangerWarning.classList.remove('hidden');
  }

  hideDanger() {
    this.dangerWarning.classList.add('hidden');
  }

  setDangerProgress(progress01) {
    this.dangerBar.style.width = `${Math.max(0, Math.min(100, (1 - progress01) * 100))}%`;
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}

export { ITEM_LABELS };
