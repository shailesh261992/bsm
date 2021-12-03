/*jshint browser: true */
/*globals Co, setTimeout, clearTimeout */

/**
 *    TODO:
 *    1) Tests
 *    2) Having template disable lazy loading for smart-gallery
 *    3) Have smart-gallery handle lazy loading of images in gallery
 *    4) Remove debounce after updates for lazy loading
 **/

Co.directive("smartgallery", function smartGallery() {
    "use strict";

    var SmartGallery = this;

    function elementIsVisible(elem) {
        var style = window.getComputedStyle(elem);
        return (style.display !== "none");
    }

    function removeStyle(id) {
        if (document.getElementById(id)) {
            document.getElementById(id).remove();
        }
    }

    function updateStyle(id, content) {
        var styleElem;
        removeStyle(id);
        styleElem = document.createElement("style");
        styleElem.id = id;

        styleElem.appendChild(content);
        document.head.appendChild(styleElem);
    }

    function getSelector(elem) {
        var selector = "";
        while (elem) {
            if (elem.id && elem.id !== "") {
                selector = "[id=\"" + elem.id + "\"] " + selector;
                /* Have to use [id=""] because Co generated IDs are not valid selectors */
                elem = undefined;
            } else if (elem.className) {
                selector = "." + elem.className.split(" ").join(".") + " " + selector;
                elem = elem.parentNode;
            } else {
                elem = undefined;
            }
        }
        return selector;
    }

    function setElementId(elem) {
        if (elem) {
            if (elem.id && elem.id !== "") {
                return true;
            } else {
                elem.id = "smartgallery-" + Co.util.createGuid();
                return true;
            }
        }
        return false;
    }

    function getImgWidth(img) {
        var src = img.getAttribute("data-src") || img.getAttribute("src");
        var width = img.closest(".media") && img.closest(".media").offsetWidth || 0;
        if (!src || !width || width <= 0 || src.indexOf("_x") > -1 || src.indexOf("media-dmg") < 0 || src.indexOf("assets-cdk.com") < 0) {
            return src;
        }
        return src.substr(0, src.lastIndexOf(".")) + "_x" + width + src.substr(src.lastIndexOf("."));
    }

    SmartGallery.init = function init(element, options) {
        this.element = element;
        this.setOptions(options);

        if (!setElementId(this.element)) { /* Need to ensure we have an element with an id */
            return;
        }

        var styleGuid = Co.util.createGuid();

        this.styleChildItemsId = "smartgallery-childitems-" + styleGuid;
        this.styleMainImageId = "smartgallery-mainimage-" + styleGuid;
        this.styleDeckId = "smartgallery-deck-" + styleGuid;
        this.styleArrows = "smartgallery-arrows-" + styleGuid;
        this.styleDeckHeight = "smartgallery-deckheight" + styleGuid;

        this.visibleThumbnails = this.visibleThumbnails || 5;
        /* Integer - How many thumbnails to display at one time */
        this.thumbnailClassName = this.thumbnailClassName || false;
        /* String - optional classname to apply to thumbnails */
        this.thumbnailMargin = this.thumbnailMargin || 20;
        /* Integer - Right Margin size between images in pixel */
        this.thumbnailMaxHeight = this.thumbnailMaxHeight || 0;
        /* Integer - The maximum height of the thumbnail images */
        this.childItemsSelector = this.childItemsSelector || ".deck > *";
        /* CSS Selector - What elements should be used as thumbnails */
        this.childItems = Array.from(this.element.querySelectorAll(this.childItemsSelector));
        /* Array - Items to be thumbnailed */
        this.thumbnailsParent = this.element.querySelector(this.childItemsSelector) && document.querySelector(getSelector(this.element.querySelector(this.childItemsSelector).parentNode)) || this.element;
        /* Element - the element which contains the thumbnails */
        this.mainImageSelector = this.mainImageSelector || ".media";
        /* CSS Selector - What element should be used as the main image container? */
        this.mainImage = this.element.querySelector(this.mainImageSelector);
        /* HTML Object -  Element in which to display the selected thumbnail */
        this.selectedIndex = this.selectedIndex || 0;
        /* Integer - Which thumbnail to select */
        this.maxPages = Math.floor(this.childItems.length / this.visibleThumbnails);
        /* Integer - Number of pages */
        this.addSingleArrows = typeof this.addSingleArrows === "boolean" ? this.addSingleArrows : true;
        /* Boolean - Should we add the elements for clicking single arrows */
        this.addPageArrows = typeof this.addPageArrows === "boolean" ? this.addPageArrows : true;
        /* Boolean - Should we add the elements for clicking page arrows */
        this.arrowClass = this.arrowClass || "arrow";
        /* String - The base name for arrow elements */
        this.dynamicArrows = typeof this.dynamicArrows === "boolean" ? this.dynamicArrows : true;
        /* Boolean - Dynamically position and size arrows when DOM changes */
        this.selectedScale = this.selectedScale;
        /* Size to scale selected item to */
        this.mainImageMinHeight = 0;

        this.sizeImages();

        if (this.childItems.length) {
            this.setupView();
            this.addArrows();
            this.attachItemEvents();
            this.attachImageLazyLoaded();
            this.addThumbnailClass();
            this.select(this.selectedIndex);
        }
    };

    SmartGallery.attachItemEvents = function attachItemEvents() {
        var self = this;

        /* Defining this internally so no need for .bind(this) on click event */
        this.childItemClick = function childItemClick(evt) {
            if (evt && evt.currentTarget) {
                self.select(self.childItems.indexOf(evt.currentTarget));
            }
        };

        this.childItemKeyDown = function childItemKeyDown(evt) {
            if (elementIsVisible(self.element)) {
                if (evt.key === "ArrowRight" || evt.key === "Right") {
                    self.select(self.selectedIndex + 1);
                } else if (evt.key === "ArrowLeft" || evt.key === "Left") {
                    self.select(self.selectedIndex - 1);
                }
            }
        };

        this.elementTouchStart = function (evt) {
            self.touchEvent = undefined;
            if (evt.touches[0]) {
                self.touchEvent = {
                    x: evt.touches[0].screenX,
                    y: evt.touches[0].screenY,
                    target: evt.touches[0].target
                };
            }
        };

        this.elementTouchEnd = function (evt) {
            var deltaX, deltaY;
            if (self.touchEvent && evt.changedTouches[0]) {
                deltaX = self.touchEvent.x - evt.changedTouches[0].screenX;
                deltaY = self.touchEvent.y - evt.changedTouches[0].screenY;

                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                    if (deltaX >= 0) {
                        self.select(self.selectedIndex + 1);
                    } else {
                        self.select(self.selectedIndex - 1);
                    }
                }
            }
        };

        this.elementTouchCancel = function () {
            self.touchEvent = undefined;
        };

        /**
         *  Why not use Co.autowire?
         *
         *  There is still (as of 7/28/16) an issue with Co.autowire that
         *  does not allow objects other than singular or self elements
         *  to be bound AND, more importantly unbound. Hence manually binding
         *  and unbinding the events.
         **/
        this.childItems.forEach(function loopInAttachItemEvents(child) {
            child.addEventListener("click", self.childItemClick, false);
        });

        window.addEventListener("keydown", self.childItemKeyDown, false);
        this.element.addEventListener("touchstart", self.elementTouchStart, true);
        this.element.addEventListener("touchend", self.elementTouchEnd, true);
        this.element.addEventListener("touchcancel", self.elementTouchCancel, true);
    };

    SmartGallery.attachImageLazyLoaded = function attachImageLazyLoaded() {
        /**
         * This will be cleaned up with performance enhancements allowing
         * for interalized lazy loading
         **/
        var self = this;
        var imgs = Array.from(this.element.querySelectorAll("img"));

        /* Defining this internally so no need for .bind(this) on event */
        this.debounceUpdateView = function debounceUpdateView() {
            clearTimeout(self.debounce);
            self.debounce = setTimeout(function debounceSetTimeout() {
                self.updateView();
            }, 250);
        };

        imgs.forEach(function loopInAttachImageLazyLoaded(img) {
            Co.on(img, "load imgLoadedSuccess imgLoadError", self.debounceUpdateView);
        });
    };

    SmartGallery.addThumbnailClass = function () {
        var self = this;
        if (this.thumbnailClassName) {
            this.childItems.forEach(function (child) {
                child.querySelector(self.mainImageSelector).classList.add(self.thumbnailClassName);
            });
        }
    };

    SmartGallery.addArrows = function addArrows() {
        var self = this;
        var arrows = [];
        var elem;

        if (this.addSingleArrows) {
            arrows = arrows.concat(["single next", "single prev"]);
        }
        if (this.addPageArrows) {
            arrows = arrows.concat(["page next", "page prev"]);
        }

        /* Defining this internally so no need for .bind(this) on click event */
        this.arrowClick = function arrowClick(evt) {
            if (evt && evt.target && evt.target.className) {
                if (evt.target.classList.contains("page")) {
                    self.select(self.selectedIndex + (evt.target.classList.contains("prev") ? (-1 * self.visibleThumbnails) : self.visibleThumbnails));
                } else if (evt.target.classList.contains("single")) {
                    self.select(self.selectedIndex + (evt.target.classList.contains("prev") ? -1 : 1));
                }
            }
        };

        arrows.forEach(function loopInAddArrows(arrow) {
            elem = document.createElement("div");
            elem.setAttribute("class", self.arrowClass + " " + arrow);
            self.element.appendChild(elem);
            elem.addEventListener("click", self.arrowClick, false);
        });
    };

    SmartGallery.updateArrows = function updateArrows() {
        var self = this;
        var styleContent = "";
        var imageMargins;

        /* See comment in setupView() as to this pattern */
        setTimeout(function setTimoutInUpdateArrows() {
            imageMargins = Math.floor((self.element.offsetWidth - self.mainImage.offsetWidth) / 2);

            if (self.mainImage.querySelector("img")) {
                imageMargins = Math.floor((self.element.offsetWidth - self.mainImage.querySelector("img").offsetWidth) / 2);
            }

            Array.from(self.element.querySelectorAll("." + self.arrowClass)).forEach(function loopInUpdateArrows(arrow) {
                arrow.removeAttribute("aria-disabled");

                if (arrow.classList.contains("page")) {
                    if ((arrow.classList.contains("prev") && self.pageIndex === 0) || (arrow.classList.contains("next") && self.pageIndex >= self.maxPages)) {
                        arrow.setAttribute("aria-disabled", "");
                    }
                } else if (arrow.classList.contains("single")) {
                    if ((arrow.classList.contains("prev") && self.selectedIndex === 0) || (arrow.classList.contains("next") && self.selectedIndex >= (self.childItems.length - 1))) {
                        arrow.setAttribute("aria-disabled", "");
                    }
                }
            });

            /* No positions are more !important than the calculated positions! */
            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".page { height: " + (self.thumbnailsParent.offsetHeight + 4) + "px!important;}";
            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".single { top: " + Math.floor(self.mainImage.offsetHeight / 2) + "px!important;}";
            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".page.prev { left: " + self.containerMargins + "px!important;}";
            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".page.next { right: " + self.containerMargins + "px!important;}";

            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".single.prev { left: " + imageMargins + "px!important;}";
            styleContent += "[id=\"" + self.element.id + "\"] ." + self.arrowClass + ".single.next { right: " + imageMargins + "px!important;}";

            updateStyle(self.styleArrows, document.createTextNode(styleContent));
        }, 0);
    };

    SmartGallery.select = function select(i) {
        if (i > this.childItems.length - 1) {
            this.selectedIndex = this.childItems.length - 1;
        } else if (i < 0) {
            this.selectedIndex = 0;
        } else {
            this.selectedIndex = i;
        }
        this.updateView();
    };

    SmartGallery.setupView = function setupView() {
        var self = this;
        var img;
        var imgMaxHeight = "";
        if (elementIsVisible(this.element)) { /* If element not visible (like in tabs), don't require all this nonsense to run */
            this.setupViewTimeout = setTimeout(function timoutInSetupView() {
                /**
                 *  Why setTimeout(fn(), 0) ?
                 *
                 *  Force this script to the end of the asyncrounous queue.
                 *  We cannot reliably count on CSS to have compeleted rendering the CSS
                 *  by the time we need to get the container width. This forces this
                 *  function to the end of the queue after the DOM has finished rendering.
                 *
                 *  http://ejohn.org/blog/how-javascript-timers-work/
                 *  http://stackoverflow.com/questions/779379/why-is-settimeoutfn-0-sometimes-useful
                 *
                 **/
                self.containerMargins = Math.floor((self.element.offsetWidth - self.mainImage.offsetWidth) / 2);

                /**
                 * For thumbnailMaxHeight we're assuming this is a gallery of images
                 * So some calculations to find out how many images we can thumbnail up to
                 * the given thumbnailMaxHeight
                 **/
                if (self.thumbnailMaxHeight) {
                    /* Find the aspect ratio of the first image and assume all images are the same ratio */
                    if (self.childItems && self.childItems.length && self.childItems[0] && self.childItems[0].querySelector("img")) {
                        img = self.childItems[0].querySelector("img");
                        self.visibleThumbnails = (Math.ceil((self.element.offsetWidth - self.containerMargins) / ((self.thumbnailMaxHeight + self.thumbnailMargin) / Number(img.naturalHeight / img.naturalWidth))));
                    }
                    imgMaxHeight = "[id=\"" + self.element.id + "\"] " + self.childItemsSelector + " img { max-height: " + self.thumbnailMaxHeight + "px;}";
                }

                self.thumbnailWidth = ((self.element.offsetWidth - (self.element.querySelector(".arrow.page").offsetWidth * 2) - (self.containerMargins * 2)) - (self.visibleThumbnails * (self.thumbnailMargin - 1))) / self.visibleThumbnails;
                updateStyle(self.styleChildItemsId, document.createTextNode("[id=\"" + self.element.id + "\"] " + self.childItemsSelector + " { width: " + self.thumbnailWidth + "px; margin-right: " + self.thumbnailMargin + "px; } [id=\"" + self.element.id + "\"] " + self.childItemsSelector + "[aria-selected=\"true\"] { min-width: " + (self.thumbnailWidth * self.selectedScale) + "px; }" + imgMaxHeight));
                self.updateView();

            }, 0);
        }
    };

    /* sizeImages()
     * Templates should be written such that when images are lazy loaded, we then resize those images here
     */
    SmartGallery.sizeImages = function sizeImages() {
        var self = this;

        /* Test all the images that haven't loaded yet */
        Array.from(this.element.querySelectorAll("img[data-src]")).forEach(function findImagesInLoadImages(img) {
            img.setAttribute("data-src", getImgWidth(img));

        });
    };

    SmartGallery.updateView = function updateView() {
        this.pageIndex = (Math.ceil((this.selectedIndex + 1) / this.visibleThumbnails) - 1);
        this.sizeImages();
        this.setMainImage();
        window.dispatchEvent(new CustomEvent("loadHorizontalImages"));

        if (this.dynamicArrows) {
            this.updateArrows();
        }
    };
    
    SmartGallery.setMainImage = function setMainImage() {
        var self = this;
        var childItem = this.childItems[this.selectedIndex];
        var internalImage = this.element.querySelector(this.mainImageSelector).children[0];

        this.childItems.forEach(function loopInSetMainImage(child, i) {
            child.setAttribute("aria-selected", "false");

            if (i >= (self.pageIndex * self.visibleThumbnails) && i < ((self.pageIndex + 1) * self.visibleThumbnails)) {
                child.classList.remove("hidden");
            } else {
                child.classList.add("hidden");
            }
        });

        if (internalImage && internalImage.offsetHeight >= this.mainImageMinHeight) {
            this.mainImageMinHeight = internalImage.offsetHeight;
        }

        updateStyle(this.styleMainImageId, document.createTextNode("[id=\"" + this.element.id + "\"] > .content " + this.mainImageSelector + " { min-height: " + this.mainImageMinHeight + "px;} [id=\"" + this.element.id + "\"] > .content " + this.mainImageSelector + ":after { content: \"" + (this.selectedIndex + 1) + " " + "of" + " " + this.childItems.length + "\"; text-align: center; display:block; }"));

        childItem.setAttribute("aria-selected", "true");
        this.mainImage.innerHTML = childItem.querySelector(this.mainImageSelector).innerHTML;

        if (self.thumbnailMaxHeight) { /* Assuming we're dealing with images */
            var imgSel = this.mainImage.querySelector("img");
            if (imgSel) {
                imgSel.addEventListener("load", function loadListenerOnImage() {
                    if (self.dynamicArrows) {
                        self.updateArrows();
                    }
                });
            }
        }
    };

    SmartGallery.update = function update() {
        if (this.childItems.length) {
            var self = this;
            this.options = this.element.getAttribute("smartgallery");
            this.setOptions(this.options);

            this.childItems.forEach(function loopInUpdate(item, i) {
                if (item.getAttribute("aria-selected") && item.getAttribute("aria-selected") === "true") {
                    self.selectedIndex = i;
                    return;
                }
            });

            this.setupView();
            this.select(this.selectedIndex);
        }
    };

    SmartGallery.destroy = function destroy() {
        if (this.childItems.length) {
            clearTimeout(this.setupViewTimeout);
            var self = this;

            this.mainImage.innerHTML = "";

            Array.from(this.element.querySelectorAll(".arrow")).forEach(function loopInDestroyRemoveArrowEventListeners(arrow) {
                arrow.removeEventListener("click", self.arrowClick, false);
                arrow.remove();
            });

            /* Clean up debouncing after internalizing lazy loading */
            clearTimeout(this.debounce);
            Array.from(this.element.querySelectorAll("img")).forEach(function loopInDestroyRemoveLazyLoadListeners(img) {
                Co.off(img, "load imgLoadedSuccess imgLoadError", self.debounceUpdateView);
            });

            this.childItems.forEach(function loopInDestroyRemoveChildEventListeners(child) {
                child.removeEventListener("click", self.childItemClick, false);
            });

            window.removeEventListener("keydown", self.childItemKeyDown, false);
            this.element.removeEventListener("touchstart", self.elementTouchStart, true);
            this.element.removeEventListener("touchend", self.elementTouchEnd, true);
            this.element.removeEventListener("touchcancel", self.elementTouchCancel, true);

            removeStyle(this.styleChildItemsId);
            removeStyle(this.styleMainImageId);
            removeStyle(this.styleDeckId);
            removeStyle(this.styleArrows);

            this.unbind();
        }
    };
});
