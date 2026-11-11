(function () {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);

  /* ---------- Language ---------- */
  const EN = {
    navWork: "Work", navAbout: "About", navTalk: "Say hi",
    heroLede: "I build software I want to use myself.",
    heroScroll: "Scroll",
    statement: "I'm Ondřej Zajíček, but online mostly oondraa. I run the OZDIGITAL studio and after hours I build my own things.",
    forkTeamKicker: "Looking for OZDIGITAL?",
    forkTeamSub: "Our team brand for websites and apps made to order. Continue to ozdigital.pages.dev",
    forkMeKicker: "Looking for me?",
    forkMeTitle: "My projects",
    forkMeSub: "Personal portfolio, apps and things I build after hours.",
    workTitle: "Selected work",
    sisDesc: "My school in one app. Timetable with substitutions, grades with what you need on the next test, absences watched against the 30% limit, free classrooms, lunches, and a notification when the school rewrites the timetable at 3 a.m.",
    sisOpen: "Open the app ↗",
    sisNote: "Unofficial student project, not affiliated with the school or the SIS authors.",
    ozbDesc: "Your music on the big screen. Lyrics word by word the moment they're sung, in styles like the lyric edits on your feed, over the official music video or the cover's colours. For Spotify, YouTube and BluOS speakers, on your monitor, on the TV or as a screensaver.",
    ozbDownload: "Download for Windows ↓",
    linkProject: "Project site ↗",
    kindWeb: "Web app", kindDesktop: "Desktop app", kindWebWin: "Web + Windows",
    tagSaver: "Screensaver",
    hudDesc: "A glass island in the bottom-right corner of Windows that watches every Claude Code session. When one finishes, fails or asks for permission, a card slides up and you approve it right where you are.",
    sosacDesc: "An unofficial client for Sosáč and Streamuj.tv. A clean interface, profiles for the whole family and your own watchlist. A web app for your phone and a Windows program in Rust, with no server of its own.",
    sosacNote: "Unofficial project, not affiliated with Sosáč or Streamuj.tv.",
    contactKicker: "Got an idea, a job or just a question?",
    contactBig: "Say hi",
    cursorOpen: "Open", cursorMail: "Write",
  };
  const CS = { cursorOpen: "Otevřít", cursorMail: "Napsat" };
  document.querySelectorAll("[data-i18n]").forEach((el) => { CS[el.dataset.i18n] = el.innerHTML; });

  let lang = "cs";
  try { if (localStorage.getItem("lang") === "en") lang = "en"; } catch (e) {}
  const langBtn = document.querySelector(".lang");
  function applyLang() {
    const dict = lang === "en" ? EN : CS;
    root.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = dict[el.dataset.i18n];
      if (v != null) el.innerHTML = v;
    });
    langBtn.textContent = lang === "en" ? "CZ" : "EN";
    langBtn.setAttribute("aria-label", lang === "en" ? "Přepnout do češtiny" : "Switch to English");
    splitWords();
  }
  langBtn.addEventListener("click", () => {
    lang = lang === "en" ? "cs" : "en";
    try { localStorage.setItem("lang", lang); } catch (e) {}
    applyLang();
    if (hasGsap) { buildWordReveal(); ScrollTrigger.refresh(); }
  });
  window.__t = (key) => (lang === "en" ? EN : CS)[key] || "";

  /* ---------- Statement: words light up as you scroll ---------- */
  const statement = document.querySelector("[data-words]");
  function splitWords() {
    statement.innerHTML = statement.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
  }
  let wordTween;
  function buildWordReveal() {
    if (wordTween) { wordTween.scrollTrigger && wordTween.scrollTrigger.kill(); wordTween.kill(); }
    const words = statement.querySelectorAll(".w");
    if (reduced) { gsap.set(words, { opacity: 1 }); return; }
    wordTween = gsap.to(words, {
      opacity: 1, ease: "none", stagger: 0.1,
      scrollTrigger: { trigger: statement, start: "top 80%", end: "bottom 45%", scrub: true },
    });
  }

  if (lang === "en") applyLang(); else splitWords();

  /* ---------- Videos: load and play only while on screen ---------- */
  const videos = document.querySelectorAll("video[data-src]");
  const vio = new IntersectionObserver((entries) => {
    entries.forEach(({ target: v, isIntersecting }) => {
      if (isIntersecting) {
        if (!v.src) { v.src = v.dataset.src; }
        if (!reduced) v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, { rootMargin: "200px 0px" });
  videos.forEach((v) => vio.observe(v));

  /* ---------- Cursor ---------- */
  const cursor = document.querySelector(".cursor");
  const label = cursor.querySelector(".cursor-label");
  if (fine) {
    let x = -100, y = -100, cx = x, cy = y;
    window.addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; cursor.style.opacity = 1; }, { passive: true });
    document.addEventListener("pointerleave", () => { cursor.style.opacity = 0; });
    (function loop() {
      cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(loop);
    })();
    document.querySelectorAll("[data-cursor-key], [data-cursor]").forEach((el) => {
      el.addEventListener("pointerenter", () => {
        label.textContent = el.dataset.cursor || window.__t(el.dataset.cursorKey);
        cursor.classList.add("is-big");
      });
      el.addEventListener("pointerleave", () => cursor.classList.remove("is-big"));
    });
  }

  /* ---------- Nav and cursor turn light over the dark contact section ---------- */
  const darkNow = new Set();
  const darkIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? darkNow.add(e.target) : darkNow.delete(e.target)));
    nav.classList.toggle("on-dark", darkNow.size > 0);
    cursor.classList.toggle("on-dark", darkNow.size > 0);
  }, { rootMargin: "0px 0px -100% 0px" });

  /* ---------- Nav hides on the way down, returns on the way up ---------- */
  const nav = document.querySelector(".nav");
  darkIO.observe(document.querySelector(".contact"));
  let lastY = 0;
  window.addEventListener("scroll", () => {
    const yNow = window.scrollY;
    nav.classList.toggle("is-hidden", yNow > lastY && yNow > 200);
    lastY = yNow;
  }, { passive: true });

  /* ---------- Without GSAP: show everything ---------- */
  const loader = document.querySelector(".loader");
  if (!hasGsap) {
    root.classList.remove("js");
    loader.remove();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { duration: 1.4 });
      });
    });
  }

  /* ---------- Intro ---------- */
  const num = loader.querySelector(".loader-num");
  const counter = { v: 0 };
  const intro = gsap.timeline({ paused: true });
  intro
    .to(counter, { v: 100, duration: reduced ? 0.01 : 1.1, ease: "power2.inOut", onUpdate: () => { num.textContent = Math.round(counter.v); } })
    .to(loader, { yPercent: -100, duration: reduced ? 0.01 : 1, ease: "expo.inOut" })
    .to(".hero .mask > span", { y: 0, duration: 1.2, ease: "expo.out", stagger: 0.08 }, "-=0.5")
    .add(() => window.dispatchEvent(new Event("hero:intro")), "-=0.9")
    .from(".nav", { yPercent: -100, opacity: 0, duration: 1, ease: "expo.out" }, "-=1")
    .add(() => loader.remove());
  const go = () => intro.play();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
  setTimeout(go, 2500);

  /* ---------- Scroll reveals ---------- */
  document.querySelectorAll("main .sec-title .mask > span, .contact .mask > span").forEach((el) => {
    gsap.to(el, { y: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: el.parentElement, start: "top 88%" } });
  });

  buildWordReveal();

  gsap.utils.toArray(".project").forEach((p) => {
    const media = p.querySelector(".project-media");
    gsap.from(media, {
      clipPath: "inset(12% 8% 12% 8% round 24px)", duration: 1.4, ease: "expo.out",
      scrollTrigger: { trigger: p, start: "top 85%" },
    });
    gsap.from(p.querySelectorAll(".project-bar, .project-head, .project-body > *"), {
      y: 40, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.06,
      scrollTrigger: { trigger: p, start: "top 90%" },
    });
    if (!reduced) {
      gsap.fromTo(media.firstElementChild, { yPercent: -5 }, {
        yPercent: 5, ease: "none",
        scrollTrigger: { trigger: media, start: "top bottom", end: "bottom top", scrub: true },
      });
    }
  });

  /* ---------- Marquee: drifts on its own, speeds up with scroll ---------- */
  if (!reduced) {
    const track = document.querySelector(".marquee-track");
    const loop = gsap.to(track, { xPercent: -50, duration: 28, ease: "none", repeat: -1 });
    ScrollTrigger.create({
      trigger: ".marquee", start: "top bottom", end: "bottom top",
      onUpdate: (self) => {
        const v = self.getVelocity() / 300;
        gsap.to(loop, { timeScale: (v < 0 ? -1 : 1) * Math.max(1, Math.abs(v)), duration: 0.2, overwrite: true });
        gsap.to(loop, { timeScale: v < 0 ? -1 : 1, duration: 1.2, delay: 0.2 });
      },
    });
  }

  gsap.from(".contact-kicker, .contact-mail, .contact-foot", {
    y: 30, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.08,
    scrollTrigger: { trigger: ".contact-big", start: "top 85%" },
  });
})();
