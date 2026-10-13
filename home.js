// Home page motion: nav state, scroll reveal, card sheen, hero parallax and drifting motes.
(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    var nav = document.querySelector(".nav");
    var hero = document.querySelector(".hero");
    var heroBg = document.querySelector(".hero-bg");
    var heroContent = document.querySelector(".hero-content");

    // ---------- Nav: solid once past the hero, highlight the section in view ----------

    function updateNav() {
        nav.classList.toggle("scrolled", window.scrollY > hero.offsetHeight - 80);
    }
    updateNav();

    var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav nav a"));
    var sections = navLinks.map(function (a) { return document.querySelector(a.getAttribute("href")); });

    function updateActive() {
        var line = window.innerHeight * 0.35;
        var current = -1;
        sections.forEach(function (s, i) {
            if (s && s.getBoundingClientRect().top <= line) current = i;
        });
        navLinks.forEach(function (a, i) { a.classList.toggle("active", i === current); });
    }
    updateActive();

    // ---------- Scroll: parallax on the hero, throttled to one update per frame ----------

    var pointerX = 0, pointerY = 0;
    var ticking = false;

    function applyParallax() {
        ticking = false;
        updateNav();
        updateActive();
        if (reduceMotion) return;
        var y = window.scrollY;
        if (y > hero.offsetHeight) return;
        heroBg.style.translate = (pointerX * -14) + "px " + (y * 0.35 + pointerY * -10) + "px";
        heroContent.style.translate = "0 " + (y * 0.15) + "px";
        heroContent.style.opacity = Math.max(0, 1 - y / (hero.offsetHeight * 0.7));
    }

    function requestTick() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(applyParallax);
        }
    }

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", requestTick);

    if (!reduceMotion && finePointer) {
        hero.addEventListener("pointermove", function (e) {
            pointerX = e.clientX / window.innerWidth - 0.5;
            pointerY = e.clientY / window.innerHeight - 0.5;
            requestTick();
        });
    }

    // ---------- Cards: fade up as they scroll in, staggered within each grid ----------

    if (!reduceMotion && "IntersectionObserver" in window) {
        var revealer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("in");
                revealer.unobserve(entry.target);
            });
        }, { rootMargin: "0px 0px -8% 0px" });

        document.querySelectorAll(".grid").forEach(function (grid) {
            Array.prototype.forEach.call(grid.children, function (card, i) {
                card.classList.add("reveal");
                card.style.setProperty("--delay", (i % 3) * 0.08 + "s");
                revealer.observe(card);
            });
        });
    }

    // ---------- Cards: a soft light follows the pointer ----------

    if (finePointer) {
        document.querySelectorAll(".card").forEach(function (card) {
            card.addEventListener("pointermove", function (e) {
                var r = card.getBoundingClientRect();
                card.style.setProperty("--mx", (e.clientX - r.left) + "px");
                card.style.setProperty("--my", (e.clientY - r.top) + "px");
            });
        });
    }

    // ---------- Hero: glowing motes drifting up through the art ----------

    var canvas = document.querySelector(".hero-motes");
    if (reduceMotion || !canvas || !canvas.getContext) return;

    var ctx = canvas.getContext("2d");
    var colors = ["#bff6ff", "#7fe3ff", "#ffffff", "#ffc27a", "#ff9fd0"];
    var sprites = colors.map(function (c) {
        var size = 64;
        var s = document.createElement("canvas");
        s.width = s.height = size;
        var g = s.getContext("2d");
        var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, "#fff");
        grad.addColorStop(0.12, c);
        grad.addColorStop(0.4, c + "55");
        grad.addColorStop(1, c + "00");
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return s;
    });

    var motes = [];
    var width = 0, height = 0;

    function spawn(m, anywhere) {
        m.x = Math.random() * width;
        m.y = anywhere ? Math.random() * height : height + 20;
        m.r = 4 + Math.random() * 10;
        m.vy = 8 + Math.random() * 18;
        m.sway = 10 + Math.random() * 25;
        m.phase = Math.random() * Math.PI * 2;
        m.speed = 0.4 + Math.random() * 0.8;
        m.twinkle = Math.random() * Math.PI * 2;
        m.depth = 0.3 + Math.random() * 0.7;
        // Mostly cool blues, the odd warm ember to echo the art.
        m.sprite = sprites[Math.random() < 0.8 ? Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 2)];
        return m;
    }

    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = hero.clientWidth;
        height = hero.clientHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var target = Math.round(Math.min(70, width * height / 16000));
        while (motes.length < target) motes.push(spawn({}, true));
        motes.length = target;
    }
    resize();
    window.addEventListener("resize", resize);

    var running = false;
    var last = 0;

    function frame(now) {
        if (!running) return;
        var dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < motes.length; i++) {
            var m = motes[i];
            m.y -= m.vy * m.depth * dt;
            m.phase += m.speed * dt;
            m.twinkle += dt * 1.6;
            if (m.y < -30) spawn(m, false);
            var x = m.x + Math.sin(m.phase) * m.sway + pointerX * -30 * m.depth;
            var y = m.y + pointerY * -20 * m.depth;
            var size = m.r * 3 * m.depth;
            // Fade in from the bottom and out near the top.
            var edge = Math.min(1, m.y / (height * 0.25), (height - m.y) / 80);
            ctx.globalAlpha = Math.max(0, edge) * (0.6 + 0.4 * Math.sin(m.twinkle)) * (0.4 + 0.6 * m.depth);
            ctx.drawImage(m.sprite, x - size / 2, y - size / 2, size, size);
        }
        requestAnimationFrame(frame);
    }

    function setRunning(on) {
        if (on === running) return;
        running = on;
        if (on) {
            last = performance.now();
            requestAnimationFrame(frame);
        }
    }

    // Only animate while the hero is on screen.
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
            setRunning(entries[0].isIntersecting);
        }).observe(hero);
    } else {
        setRunning(true);
    }
})();
