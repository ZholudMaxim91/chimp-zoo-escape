'use strict';
// ───────── Локальный профиль: имя + пароль ─────────
// Хранится только в этом браузере (localStorage). Пароль не отправляется по сети — по сети уходит лишь имя.
// Это защита профиля на этом устройстве, а не настоящая учётная запись.
const Profile = {
  KEY: 'chimpProfiles2', cur: null,
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
  saveAll(o) { try { localStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) { } },
  async hash(pw, salt) {
    const enc = new TextEncoder();
    if (window.crypto && crypto.subtle) {
      const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 60000, hash: 'SHA-256' }, k, 256);
      return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = hashStr(salt + pw); for (let i = 0; i < 5000; i++) h = hashStr(h + salt + pw); return 'w' + h;   // запасной вариант
  },
  async enter(name, pw) {
    name = (name || '').trim().slice(0, 14);
    if (name.length < 2) throw new Error('Имя — минимум 2 символа');
    if ((pw || '').length < 4) throw new Error('Пароль — минимум 4 символа');
    const all = this.load(), p = all[name];
    if (!p) { const salt = Math.random().toString(36).slice(2) + Date.now().toString(36); all[name] = { salt, hash: await this.hash(pw, salt), best: 0, games: 0, wins: 0 }; this.saveAll(all); this.cur = name; try { localStorage.setItem('chimpLastName', name); } catch (e) { } return 'created'; }
    if (await this.hash(pw, p.salt) !== p.hash) throw new Error('Неверный пароль');
    this.cur = name; try { localStorage.setItem('chimpLastName', name); } catch (e) { } return 'login';
  },
  info() { return this.cur ? this.load()[this.cur] : null; },
  record(score, won) { if (!this.cur) return; const all = this.load(), p = all[this.cur]; if (!p) return; p.games++; if (won) p.wins++; p.best = Math.max(p.best, score); this.saveAll(all); },
  logout() { this.cur = null; },
};
