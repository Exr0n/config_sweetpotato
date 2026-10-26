// ==UserScript==
// @name         Desmos Reverse Contrast
// @namespace    http://tampermonkey.net/
// @version      2024-07-01
// @description  try to take over the world!
// @author       https://www.reddit.com/r/desmos/comments/124wsa2/comment/je93lm8/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button
// @match        https://www.desmos.com/calculator
// @icon         https://www.google.com/s2/favicons?sz=64&domain=desmos.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    window.onmousemove = () => {
        Calc.controller.graphSettings.config.invertedColors = true;
        Calc.controller.updateViews();
        window.onmousemove = null;
    }
})();