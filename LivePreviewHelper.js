/*
 * Copyright (c) Codiad & Andr3as, distributed
 * as-is and without warranty under the MIT License.
 * See http://opensource.org/licenses/MIT for more information. 
 * This information must remain intact.
 */

codiad.LivePreviewHelper = {

    version: "1.1.0",
    status: false,
    extensions: [],

    /**
     * Initialisation
     * 
     * @param {string} path Location of the script
     * @returns {boolean} If init succeeded or not
     */
    init: function(path) {
        if (typeof(path) == 'undefined') {
            return false;
        }
        var _this = this;
        //Add rightbar entry
        if ($('.live-preview').length === 0) {
            $('.sb-right-content hr:first').before('<hr class="live-preview"><a class="live-preview" onclick="codiad.LivePreviewHelper.livePreview(); return false;"><i class="icon-eye"></i> Live Preview</a>');
        }
        $('.live-preview').hide();
        
        this.$onDocumentChange = this.onDocumentChange.bind(this);
        //Focus listener
        amplify.subscribe("active.onOpen", function(path){
            if (codiad.editor.getActive() !== null && _this.testPath(path)) {
                var manager = codiad.editor.getActive().commands;
                manager.addCommand({
                    name: 'OpenLivePreview',
                    bindKey: "Ctrl-Shift-O",
                    exec: function () {
                        _this.livePreview();
                    }
                });
            }
        });
        amplify.subscribe('active.onFocus', function(path){
            if (_this.testPath(path)) {
                $('.live-preview').show();
                codiad.editor.getActive().getSession().addEventListener(_this.$onDocumentChange);
            } else {
                $('.live-preview').hide();
                if (_this.status) {
                    _this.hide();
                }
            }
        });
        amplify.subscribe('active.onClose', function(path){
            if (_this.testPath(path)) {
                $('.live-preview').hide();
                if (_this.status) {
                    _this.hide();
                }
            } 
        });
        //Load style
        $.get(path + 'LivePreviewHelper.css', function(styles){
            _this.domLib = ace.require("ace/lib/dom");
            _this.domLib.importCssString(styles);
        });
        //Set timeout for extension registration
        setTimeout(function(){
            amplify.publish('helper.onLivePreviewInit');
        }, 500);
        return true;
    },

    /**
     * Toggle live preview
     * 
     * @param {string} path Path of file for preview
     */
    livePreview: function(path) {
        path = path || codiad.active.getPath();
        if (this.testPath(path)) {
            if (!this.status) {
                this.show(path);
            } else {
                this.hide(path);
            }
        }
    },
    
    /**
     * Register an extension for live preview
     * 
     * @param {(string|string[])} ext Extension or Array of Extensions
     */
    registerExtension: function(ext) {
        var _this = this;
        if ($.isArray(ext)) {
            $.each(ext, function(i, item){
                _this.extensions.push(item);
            });
        } else {
            _this.extensions.push(ext);
        }
    },

    /**
     * Show preview
     * 
     * @param {string} path Path of file for preview
     */
    show: function(path) {
    	//If the window is divided?
        if ($('.editor').length > 1) {
            codiad.message.error("Livepreview does not work with splited windows");
            return false;
        }
        $('.editor').width('50%');
        codiad.editor.resize();
        $('.editor').after('<div class="preview"><iframe></iframe></div>');
        //Add change listener
        var session = codiad.editor.getActive().getSession();
        session.addEventListener('change', this.$onDocumentChange);

        amplify.publish('helper.onStartLivePreview', path);

        this.status = true;
    },

    /**
     * Hide preview
     * 
     * @param {string} path Path of file for preview
     */
    hide: function(path) {
        $('.editor').width('100%');
        codiad.editor.resize();
        $('.preview').remove();
        //Remove change listener
        var session = codiad.editor.getActive().getSession();
        session.removeEventListener('change', this.$onDocumentChange);

        amplify.publish('helper.onStopLivePreview', path);

        this.status = false;
    },

    /**
     * Document Change listener
     */
    onDocumentChange: function(e) {
        amplify.publish('helper.onChangeLivePreview', e);
    },

    /**
     * Update content of live preview
     * 
     * @param {string} selector
     * @param {string} content If content is not given, the first argument is taken as content
     */
    updateContent: function(selector, content) {
        if (typeof(content) == 'undefined') {
            //No selector, content is a complete HTML document
            content = selector;
            var iframe = $('.preview iframe').get(0);
            if (! iframe) {
                return;
            }
            this.writeContent(iframe, content);
        } else {
            $(selector).html(content);
        }
    },

    /**
     * Write a complete HTML document into the preview iframe.
     * An already rendered document is patched in place so the scroll
     * position survives every update instead of jumping back to the top.
     *
     * @param {Element} iframe Preview iframe
     * @param {string} content Complete HTML document
     */
    writeContent: function(iframe, content) {
        var doc = null, win = null;
        try {
            win  = iframe.contentWindow;
            doc  = iframe.contentDocument || (win && win.document);
        } catch (e) {
            doc = null;
        }
        //Only patch a document that was fully rendered by us, otherwise
        //(first render or still loading) fall back to a normal srcdoc load.
        var rendered = iframe.hasAttribute('srcdoc') && doc && win
                    && doc.readyState === 'complete' && doc.body && doc.head
                    && doc.head.querySelector('link[rel="stylesheet"], style');
        if (rendered) {
            var parsed = null;
            try {
                parsed = new DOMParser().parseFromString(content, 'text/html');
            } catch (e) {
                parsed = null;
            }
            if (parsed && parsed.body && parsed.head) {
                var scrollX = win.pageXOffset || 0,
                    scrollY = win.pageYOffset || 0;
                if (parsed.title) {
                    doc.title = parsed.title;
                }
                if (doc.head.innerHTML !== parsed.head.innerHTML) {
                    doc.head.innerHTML = parsed.head.innerHTML;
                }
                doc.body.innerHTML = parsed.body.innerHTML;
                win.scrollTo(scrollX, scrollY);
                return;
            }
        }
        if ('srcdoc' in iframe) {
            //srcdoc parses the string as a real document, so <head>,
            //<body> and the preview stylesheet link are applied correctly
            iframe.srcdoc = content;
        } else {
            var contents = $(iframe).contents(),
                scrollLeft = contents.scrollLeft(),
                scrollTop = contents.scrollTop();
            contents.find('html').html(content);
            if (win && win.scrollTo) {
                win.scrollTo(scrollLeft, scrollTop);
            }
        }
    },

    /**
     * Test path for specific extension
     * 
     * @param {string} path Path of file
     * @returns {boolean} Whether it matches or not
     */
    testPath: function(path) {
        var ext = "";
        var res = false;
        $.each(this.extensions, function(i, ext){
            if (new RegExp("(."+ext+")$", "").test(path)) {
                res = true;
            }
        });
        return res;
    }
};