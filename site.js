/* GameDay Helpers: shared navigation behavior. No dependencies. */
(function () {
  var nav = document.getElementById('nav');
  var btn = document.querySelector('.menu-btn');
  if (!nav || !btn) return;
  function setOpen(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); btn.focus(); }
  });
  nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
})();

/* Logo intro: pops, spins, then flies into the header logo. Once per tab session. */
(function () {
  var key = "gdh-intro-seen-v1", seen = false;
  try { seen = sessionStorage.getItem(key) === "1"; } catch (_) {}
  if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var target = document.querySelector("header .logo-img");
  if (!target) return;
  try { sessionStorage.setItem(key, "1"); } catch (_) {}
  var intro = document.createElement("div"); intro.id = "gdh-intro"; intro.setAttribute("aria-hidden", "true");
  var img = document.createElement("img"); img.src = target.getAttribute("src"); img.alt = ""; img.width = 200; img.height = 54;
  var p = document.createElement("p"); p.textContent = "You coach. We score.";
  intro.appendChild(img); intro.appendChild(p); document.body.appendChild(intro);
  function fly() {
    var a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width) { intro.remove(); return; }
    var scale = b.width / a.width;
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    intro.classList.add("gdh-fly");
    img.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + scale + ")";
    img.style.opacity = "0";
    setTimeout(function () { intro.remove(); }, 700);
  }
  setTimeout(fly, 2000);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") intro.remove(); }, { once: true });
})();
