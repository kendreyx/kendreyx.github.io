(function () {
    'use strict';

    var config = JSON.parse(document.getElementById('site-translations').textContent);
    var translations = config.messages;
    var storageKey = 'kendrey-blog-language';
    var language = preferredLanguage();

    function supported(value) {
        return value === 'zh' || value === 'en';
    }

    function preferredLanguage() {
        var requested = new URLSearchParams(window.location.search).get('lang');
        if (supported(requested)) return requested;
        try {
            var saved = window.localStorage.getItem(storageKey);
            if (supported(saved)) return saved;
        } catch (error) {
            // Language switching also works when browser storage is unavailable.
        }
        return 'zh';
    }

    function text(key) {
        return translations[language][key] || translations.zh[key] || key;
    }

    function updateDocumentLanguage() {
        document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
        document.documentElement.setAttribute('data-language', language);
        try {
            window.localStorage.setItem(storageKey, language);
        } catch (error) {
            // Internal links preserve the choice even without localStorage.
        }
    }

    function render() {
        document.querySelectorAll('[data-i18n]').forEach(function (element) {
            element.textContent = text(element.getAttribute('data-i18n'));
        });
        ['placeholder', 'aria-label', 'content'].forEach(function (attribute) {
            document.querySelectorAll('[data-i18n-' + attribute + ']').forEach(function (element) {
                element.setAttribute(attribute, text(element.getAttribute('data-i18n-' + attribute)));
            });
        });
        document.querySelectorAll('[data-language-selector]').forEach(function (selector) {
            selector.value = language;
        });
        document.querySelectorAll('[data-language-content], .post-container.zh, .post-container.en').forEach(function (element) {
            var contentLanguage = element.getAttribute('data-language-content') || (element.classList.contains('en') ? 'en' : 'zh');
            element.hidden = contentLanguage !== language;
            element.classList.toggle('active', contentLanguage === language);
        });
        document.querySelectorAll('[data-page-title]').forEach(function (element) {
            element.textContent = text(element.getAttribute('data-page-title')) + ' - ' + config.title;
        });
        document.querySelectorAll('time[data-date]').forEach(function (element) {
            var date = new Date(element.getAttribute('data-date').slice(0, 10));
            if (!isNaN(date.getTime())) {
                element.textContent = new Intl.DateTimeFormat(language === 'en' ? 'en' : 'zh-CN', {
                    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
                }).format(date);
            }
        });
        document.querySelectorAll('a[href]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
            var url = new URL(href, window.location.href);
            if (url.origin === window.location.origin && (/\/$/.test(url.pathname) || /\.html$/.test(url.pathname))) {
                url.searchParams.set('lang', language);
                link.setAttribute('href', url.pathname + url.search + url.hash);
            }
        });
        document.dispatchEvent(new CustomEvent('blog:languagechange', { detail: { language: language } }));
    }

    function setLanguage(value) {
        if (!supported(value)) return;
        language = value;
        updateDocumentLanguage();
        var url = new URL(window.location.href);
        url.searchParams.set('lang', language);
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        render();
    }

    // Set the language before styles render to avoid flashing the other language.
    updateDocumentLanguage();
    window.blogI18n = { text: text, setLanguage: setLanguage };
    document.addEventListener('DOMContentLoaded', render);
    document.addEventListener('change', function (event) {
        if (event.target.matches('[data-language-selector]')) setLanguage(event.target.value);
    });
    window.addEventListener('popstate', function () {
        language = preferredLanguage();
        updateDocumentLanguage();
        render();
    });
}());
