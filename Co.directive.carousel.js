/*jshint es3: false, forin: true, freeze: true, latedef: true, newcap: false, strict: true, undef:true, camelcase: true, curly: true, eqeqeq: false, immed: true, lastsemic: true, onevar: true, unused:true, maxdepth: 4, maxcomplexity: 8 */
/*globals Co, window, document, CustomEvent */
Co.directive("carousel", function () {

    "use strict";

    var Carousel = this,
        Static = Carousel['static'],
        DOCHILATETRACONTAOCTAGON = Static.DOCHILATETRACONTAOCTAGON = 2048,
        HORIZONTAL = Static.HORIZONAL = 1,
        MINIMUM_CIRCULAR_SLIDES = 6,
        POLYGON_STYLE = "translateZ(-{{radius}}px) {{rotateXY}}({{angle}}deg)",
        FACE_STYLE = "{{rotateXY}}({{angle}}deg) translateZ({{radius}}px)",
        TOUCHING = "touching",
        YES = Static.YES = "yes",
        NO = Static.NO = "no",
        MAYBE = Static.MAYBE = "maybe",
        NEVER = Static.NEVER = "never",
        TOUCH_THRESHOLD = Static.TOUCH_THRESHOLD = 10,
        EDGE_RESISTANCE = 4,
        DUMMY = document.createElement('span'),
        SELECTED = "selected",
        NEXTSLIDE = "next-slide",
        PREVSLIDE = "prev-slide",
        IE_MARGIN_SHIFT = "-200px",
        INITIAL_ROTATION_DELAY = 6000,
        AUTOROTATE_INTERVAL = 6000;

    Static.VERTICAL = 0;


    /**
     * When styling a carousel:
     *
     *   - Apply "transform-style: preserve-3d" to the carousel element.
     *   - Position all the slides absolutely
     *   - Place the slides where they would be if they were selected
     *   - Slides can only be immediate children of the carousel element.
     */
    Carousel.init = function (element, options) {
        if (!Static.hasOwnProperty("TRANSFORM_PROPNAME")) {
            Static.TRANSFORM_PROPNAME = Static.getCssTransformProperty();
        }

        // Set the carousel's options:
        this.enabled = true; // Can the user touch the carousel?
        this.applyTransformations = true; // Should the carousel render the 3d transformations?
        this.axis = HORIZONTAL; // Which direction should the carousel rotate?
        this.isCircular = false; // Does the carousel loop?
        this.acceleration = 1; // How fast does the carousel rotate?
        this.selectedIndex = 0; // Which item should begin selected?
        this.faceSelector = undefined; // Which immediate children of the element should become faces?
        this.autoRotate = false; // Should the carousel auto rotate with specified interval?
        this.selectedClass = SELECTED; // CSS classname to be applied to selected item
        this.nextSlide = NEXTSLIDE; // CSS classname to be applied to next slide in carousel
        this.previousSlide = PREVSLIDE; // CSS classname to be applied to previous slide in carousel

        this.setOptions(options); // Override any of the above options that were set in the carousel attribute.

        this.element = element;
        this.faces = undefined; // The face elements included in the carousel polygon.
        this.slideCount = undefined; // The number of slides in the carousel.
        this.faceCount = undefined; // The number of actual faces in the polygon (may not be the same as faces.length).

        this.angle = 0; // The current angle of rotation.
        this.theta = 0; // The angle between faces.
        this.touching = NO; // Is the user currently touching the carousel?
        this.autoRotateHandlerID = null; // Auto Rotation Handler Id
        this.startTimeout = null; // Start auto rotation
        this.transitionDuration = this.transitionDuration || 0; //transition-duration define in less
        // Activate autoRotate set via design
        if(element.parentElement) {
            this.autoRotate = element.parentElement.classList.contains('carousel-autorotate') ? AUTOROTATE_INTERVAL : this.autoRotate;
        }
        this.mouseoutHandler =  this.startAutoRotate.bind(this);
        this.mouseoverHandler = this.stopAutoRotate.bind(this);
        this.update(); // Initialize the carousel.
    };


    /**
     * Caches the CSS transform property the browser recognizes (standard or prefixed).
     */
    Static.getCssTransformProperty = function () {

        var TRANSFORM_PROPNAMES = ["transform", "webkitTransform", "mozTransform", "msTransform"],
            availableStyles = window.getComputedStyle(DUMMY),
            result = "",
            propertyX;

        while (!result && TRANSFORM_PROPNAMES.length > 0) {
            propertyX = TRANSFORM_PROPNAMES.shift();
            if (typeof availableStyles[propertyX] !== "undefined") {
                result = propertyX;
            }
        }

        return result;
    };


    /**
     * Showcases the item specified by index.
     */
    Carousel.select = function (index) {

        if (index.type == "carouselSelectIndex") {
            index = index.originalEvent.detail.selectedIndex;
            this.stopAutoRotate();
        }

        if(index == undefined){
            return;
        }
        var carousel = this.element,
            newSelected = carousel.children[index] || DUMMY,
            currentSelected = carousel.querySelector("." + this.selectedClass) || DUMMY;
        (index === 0) ? carousel.classList.add("first"): carousel.classList.remove("first");
        (index === this.slideCount - 1) ? carousel.classList.add("last"): carousel.classList.remove("last");

        currentSelected.classList.remove(this.selectedClass);
        this.rotateToItem(index);
        newSelected.classList.add(this.selectedClass);
        if(this.inBuiltCarouselArrows){
            this.updateArrowsClasses();
        }

        if(this.transitionDuration) {
            setTimeout(function () {
                window.dispatchEvent(new CustomEvent("loadHorizontalImages"));
            },this.transitionDuration);
        }

        this.element.dispatchEvent(new CustomEvent("carouselUpdated", {
            detail: {
                selectedIndex: this.selectedIndex
            }
        }));
    };

    Carousel.select.context = "element";
    Carousel.select.event = "carouselSelectIndex";

    /**
     * Rotates the carousel to bring the specified card into view.
     */
    Carousel.rotateToItem = function (index) {

        var angle,
            delta,
            shortestAngle;

        this.selectedIndex = index;

        // Calculate the angle of the selected index,
        // and the normalized delta between the current angle
        // and the new one:
        angle = index * this.theta;
        delta = (this.angle % 360) + angle;

        // Determine if it's quicker to rotate backwards or forwards...
        shortestAngle = this.angle - delta;
        if (delta <= -180) {
            shortestAngle -= 360;
        } else if (delta > 180) {
            shortestAngle += 360;
        }

        // ...and rotate the slide container:
        this.rotate(shortestAngle);
    };

    /**
     * Rotates the carousel to the specified angle.
     */
    Carousel.rotate = function (angle) {

        var carousel = this,
            style = this.applyTransformations && POLYGON_STYLE || "",
            index = this.findIndex(angle),
            carouselChild,
            nextSlide, prevSlide;

        // If the index has changed, trigger an event:
        if (index !== this.index) {
            Co.trigger(this.element, "carousel.select", [index]);
        }

        // Adding a negligible angle to workaround a chrome issue where the carousel elmenent gets unresponsive when rotated to certain absolute angles like 90, 270 etc.
        if(this.isCircular) {
            angle = (angle % 9) === 0 ? angle + 0.01 : angle;
        }
        this.angle = angle;
        this.index = index;

        style = style.replace("{{radius}}", carousel.radius)
            .replace("{{rotateXY}}", carousel.rotationProperty)
            .replace("{{angle}}", angle);

        carouselChild = carousel.faces;
        // Add previous and next slide classes for styling purposes.
        if(carouselChild.length > 1) {
            carouselChild.forEach(function(carouselSlide) {
                carouselSlide.classList.remove(carousel.nextSlide);
                carouselSlide.classList.remove(carousel.previousSlide);
            });
            // Compute Next slide
            nextSlide = (this.index + 1) < carouselChild.length ? carouselChild[this.index + 1] : (carousel.isCircular ? carouselChild[0] : null);
            if(nextSlide) {
                nextSlide.classList.add(this.nextSlide);
            }
            //Compuate previous slide
            prevSlide = (this.index -1) >= 0 ? carouselChild[this.index - 1] : (carousel.isCircular ? carouselChild[carouselChild.length - 1] : null);
            if(prevSlide) {
                prevSlide.classList.add(this.previousSlide);
            }
        }

        //Only for IE11. Added vendor prefix for Safari8
        if (!Carousel.isIE11() ) {
            carousel.element.style[Static.TRANSFORM_PROPNAME] = style;
        } else {
            carousel.element.style.transition = "none";
            for (var i = 0; i < carouselChild.length; i++) {
                carouselChild[i].style.display = "flex";
                carouselChild[i].style.marginRight = "auto";
                carouselChild[i].style.marginLeft = "auto";
                carouselChild[i].style.transition = "none";
                carouselChild[i].style.zIndex = "0";
            }
            carouselChild[this.index].classList.add(this.selectedClass);
            carouselChild[this.index].style.zIndex = "1";

            if(this.index === 0) {

                if(carouselChild[this.index + 1]) {
                    carouselChild[this.index + 1].style.marginRight = IE_MARGIN_SHIFT;//the margin value(-200px) should be big enough,any big value will do since slides's opacity is 0
                }

            } else if(this.index === (carouselChild.length - 1)) {

                if(carouselChild[this.index - 1]) {
                    carouselChild[this.index - 1].style.marginLeft = IE_MARGIN_SHIFT;
                }

            } else if(this.index > 0) {

                if(carouselChild[this.index + 1]) {
                    carouselChild[this.index + 1].style.marginRight = IE_MARGIN_SHIFT;
                }
                if(carouselChild[this.index - 1]) {
                    carouselChild[this.index - 1].style.marginLeft = IE_MARGIN_SHIFT;
                }

            }

            if(carousel.isCircular) {
                for (var i = 0; i < carouselChild.length; i++) {
                    if(carouselChild[i].rotateProp) {
                        carouselChild[i].style[Static.TRANSFORM_PROPNAME] = style + ' ' + carouselChild[i].rotateProp;
                    }else {
                        carouselChild[i].style[Static.TRANSFORM_PROPNAME] = style;
                    }
                }
            }else {
                carouselChild[this.index].style[Static.TRANSFORM_PROPNAME] = style;
            }

        }

        this.element.dispatchEvent(new CustomEvent("transitionend"));
    };

    Carousel.isIE11 = function () {
        return !!(navigator.userAgent.match(/Trident/) && navigator.userAgent.match(/rv[ :]11/));
    };

    Carousel.isIEEdge = function () {
        return navigator.userAgent.indexOf("Edge/") !== -1;
    };

    /**
     * On non-touch devices, clicking a slide selects it.
     */
    Carousel.click = function (event) {
        var element,
            index,
            children = Array.prototype.slice.call(this.element.children, 0);

        element = this.findItemFor(event.target);
        index = children.indexOf(element);

        if (index !== -1) {
            this.select(index);
        }

        this.stopAutoRotate();
    };
    Carousel.click.context = "element";

    /**
     * Finds the slide that contains the given element.
     */
    Carousel.findItemFor = function (originalElement) {

        var element = originalElement,
            parent = element.parentElement,
            immediateChild;

        while (element) {

            if (element === this.element) {
                element = null;
                break;
            }

            if (parent === this.element) {
                immediateChild = element;
                break;
            }

            element = parent;
            parent = element.parentElement;
        }

        return immediateChild;
    };


    /**
     *
     */
    Carousel.touchStart = function (event) {

        if (!this.enabled || !this.applyTransformations) {
            return;
        }

        event = this.normalizeEvent(event);

        this.touching = MAYBE;
        this.touchOrigin = {
            x: event.x,
            y: event.y
        };
        this.touchStart = new Date().getTime();
        this.startingAngle = this.angle;
        this.startingIndex = this.findIndex(this.angle);
    };
    Carousel.touchStart.context = "element";
    Carousel.touchStart.event = "touchstart";


    /**
     *
     */
    Carousel.touchFilter = function (event) {

        if (this.touching !== MAYBE) {
            return;
        }

        event = this.normalizeEvent(event);

        var swipeDirection = this.axis === HORIZONTAL && "x" || "y",
            scrollDirection = this.axis === HORIZONTAL && "y" || "x",
            swipeDelta = Math.abs(event[swipeDirection] - this.touchOrigin[swipeDirection]),
            scrollDelta = Math.abs(event[scrollDirection] - this.touchOrigin[scrollDirection]),
            swiping = swipeDelta > TOUCH_THRESHOLD && scrollDelta < TOUCH_THRESHOLD,
            scrolling = scrollDelta > TOUCH_THRESHOLD && swipeDelta < TOUCH_THRESHOLD;

        // If we've started to swipe, enable the swipe handler:
        if (swiping) {
            this.element.classList.add(TOUCHING);
            this.touching = YES;
            this.touchMove(event);
        }

        // If we've started to scroll, stop checking for swipes:
        else if (scrolling) {
            this.touching = NEVER;
        }
    };
    Carousel.touchFilter.context = "element";
    Carousel.touchFilter.event = "touchmove";


    /**
     *
     */
    Carousel.touchMove = function (event) {

        if (this.touching !== YES) {
            return;
        }

        event = this.normalizeEvent(event);

        var xy = this.axis === HORIZONTAL && "x" || "y",
            delta = (this.faceSize / (event[xy] - this.touchOrigin[xy])),
            onFirstCard = (this.startingIndex === 0),
            onLastCard = (this.startingIndex === this.slideCount - 1),
            movingBackward = (delta > 0),
            movingForward = (delta < 0),
            pastTheEnd = !this.isCircular && (onFirstCard && movingBackward || onLastCard && movingForward),
            resistance = pastTheEnd && EDGE_RESISTANCE || 1,
            theta = this.startingAngle + (this.theta / (delta / this.acceleration * resistance));

        this.rotate(theta);

        event.stopPropagation();
        event.preventDefault();
    };
    Carousel.touchMove.context = "element";
    Carousel.touchMove.event = "touchmove";


    /**
     *
     */
    Carousel.touchEnd = function (event) {

        if (this.touching !== YES || !this.enabled || !this.applyTransformations) {
            return;
        }

        event = this.normalizeEvent(event);

        var index = this.startingIndex,
            touchEnd = new Date().getTime(),
            xy = this.axis === HORIZONTAL && "x" || "y",
            delta = event[xy] - this.touchOrigin[xy],
            direction = delta > 0 && -1 || 1,
            isQuickTouch = touchEnd - this.touchStart < 250,
            isSwipe = Math.abs(delta) > 20;

        // Turn off touching:
        this.touching = NO;
        this.element.classList.remove(TOUCHING);

        // If the user performed a swipe gesture, or the drag
        // threshold was crossed, move to the next/previous slide:
        if (isQuickTouch && isSwipe) {
            index = this.normalizeIndex(this.startingIndex + direction);
        } else {
            index = this.findIndex(this.angle);
        }
        this.stopAutoRotate();

        this.select(index);
    };
    Carousel.touchEnd.context = "element";
    Carousel.touchEnd.event = "touchend touchleave touchcancel";


    /**
     * Normalizes touches and mouse movement into a single set of x/y variables.
     */
    Carousel.normalizeEvent = function (event) {

        var touches = event.originalEvent && event.originalEvent.changedTouches,
            isTouchable = touches;

        if (isTouchable) {
            event.x = touches[0].pageX;
            event.y = touches[0].pageY;
        } else {
            event.x = event.clientX;
            event.y = event.clientY;
        }

        return event;
    };


    /**
     * Given an angle, finds the index of the element.
     */
    Carousel.findIndex = function (angle) {

        var index;

        // Normalize the angle:
        angle = this.normalizeAngle(angle);
        angle = angle % 360;
        if (angle > 0) {
            angle = angle - 360;
        }

        index = Math.round(Math.abs(angle / this.theta));
        index = this.normalizeIndex(index);
        return index;
    };


    /**
     * Wraps an index if it falls outside the bounds of
     * the carousel's card count.
     */
    Carousel.normalizeIndex = function (index) {

        if (index < 0) {
            index = this.isCircular ? this.slideCount - 1 : this.startingIndex;
        } else if (index >= this.slideCount) {
            index = this.isCircular ? 0 : this.startingIndex;
        }

        return index;
    };


    /**
     * Reduces an angle greater than 360 degrees to less than 360 degrees.
     */
    Carousel.normalizeAngle = function (angle) {
        return Math.round(angle / this.theta) * this.theta;
    };


    /**
     * Updates the carousel's settings based on the current state of the DOM.
     */
        Carousel.update = function (options) {
        /* Updating directive options if changed */
        this.setOptions(options);

        var carousel = this,
            style = this.applyTransformations && FACE_STYLE || "",
            faces = this.faces = this.faceSelector && this.element.querySelectorAll(this.faceSelector) || this.element.children,
            firstChild = faces[0] || {
                    offsetWidth: 0,
                    offsetHeight: 0
                },
            newStyle;
        this.sizeProperty = this.axis === HORIZONTAL && "offsetWidth" || "offsetHeight";

        var faceSize = firstChild[this.sizeProperty];
        if(this.faceSize == faceSize){
            return ;
        }
        this.faceSize = faceSize;



        faces.forEach = Array.prototype.forEach;

        this.faces.forEach(function (face) {
            face.setAttribute("style", "");
            Array.from(face.children).forEach(function (child) {
                child.setAttribute("style", "");
            });
        });

        // Add the touching class to indicate that we're going to
        // move the carousel:
        this.element.classList.add(TOUCHING);

        // Determine which size and rotation property we should use, which
        // depends on the carousel's axis of rotation:

        this.rotationProperty = this.axis === HORIZONTAL && "rotateY" || "rotateX";

        // Count the number of slide we have, and measure the size of each face in the polygon:
        this.slideCount = faces.length;



        // Determine how many faces the carousel polygon should have.  If the carousel is circular and there are enough slides,
        // use the slide count.  Otherwise, use a really big polygon, which will make the carousel appear flat:
        this.faceCount = this.isCircular && this.slideCount >= MINIMUM_CIRCULAR_SLIDES && this.slideCount || DOCHILATETRACONTAOCTAGON;

        // Calculate the angle each face is rotated, and the radius of the carousel polygon:
        this.theta = 360 / this.faceCount;
        this.radius = Math.round((this.faceSize / 2) / Math.tan(Math.PI / this.faceCount));

        // At this point, all the faces are at the center of the carousel polygon.
        // So, rotate each face, and push it to the edge of the polygon:
        faces.forEach(function (face, i) {
            newStyle = style.replace("{{rotateXY}}", carousel.rotationProperty)
                .replace("{{angle}}", carousel.theta * i)
                .replace("{{radius}}", carousel.radius);
            face.style[Static.TRANSFORM_PROPNAME] = newStyle;
            face.rotateProp = newStyle;
        });

        if(this.inBuiltCarouselArrows){
            this.removeArrow()
            this.addArrow();
            this.updateArrowsClasses();
        }else{
            this.removeArrow();
        }

        // Rotate the current slide into view:
        this.selectedIndex = this.selectedIndex < this.slideCount ? this.selectedIndex : 0;

        this.select(this.selectedIndex);

        clearTimeout(this.startTimeout); //Clear timeout

        if (this.autoRotate) {
            this.element.addEventListener('mouseout', this.mouseoutHandler);
            this.element.addEventListener('mouseover',this.mouseoverHandler)
            this.startTimeout = setTimeout(function () {
                carousel.startAutoRotate();
            },INITIAL_ROTATION_DELAY);
        }else{
            this.stopAutoRotate();
            this.element.removeEventListener('mouseout', this.mouseoutHandler);
            this.element.removeEventListener('mouseover',this.mouseoverHandler);
        }

        // Give the browser time to render the changes before turning off the touching class:
        window.setTimeout(function () {
            this.element.classList.remove(TOUCHING);
        }.bind(this), 0);

    };

    /**
     * Starts autoRotating the slider with configured interval
     */
    Carousel.startAutoRotate = function () {
        var self = this,
            start = this.selectedIndex;
        if (this.autoRotateHandlerID == null) {
            this.autoRotateHandlerID = setInterval(function () {
                if (start < self.slideCount - 1) {
                    start++;
                } else {
                    start = 0;
                }
                self.select(start);
            }, this.autoRotate);
        }
    };

    /**
     * Stops autoRotation
     */
    Carousel.stopAutoRotate = function () {
        clearInterval(this.autoRotateHandlerID);
        this.autoRotateHandlerID = null;
    };

    Carousel.updateArrowsClasses = function () {
        var lastFaceIndex = this.slideCount-1;
        var firstFaceIndex = 0;
        if(this.selectedIndex == lastFaceIndex){
            this.nextArrow.classList.add('last');
        }else{
            this.nextArrow.classList.contains('last') && this.nextArrow.classList.remove('last');
        }

        if(this.selectedIndex == firstFaceIndex){
            this.prevArrow.classList.add('first');
        }else{
            this.prevArrow.classList.contains('first') && this.prevArrow.classList.remove('first');
        }
    }

    Carousel.addArrow = function () {
        var carousel = this;
        this.nextArrow = getArrow('next');
        this.prevArrow = getArrow('prev');

        this.nextArrow.addEventListener('click',function () {
            carousel.stopAutoRotate();
            var nextIndex = carousel.selectedIndex +1 ;
            var lastFaceIndex = carousel.slideCount-1;
            nextIndex = nextIndex < carousel.slideCount ? nextIndex : lastFaceIndex;
            carousel.select(nextIndex,true);
        });

        this.prevArrow.addEventListener('click',function () {
            carousel.stopAutoRotate();
            var prevIndex = carousel.selectedIndex -1 ;
            prevIndex = prevIndex >=0 ? prevIndex:0 ;
            carousel.select(prevIndex,true);
        });


        this.element.parentElement.appendChild(this.nextArrow);
        this.element.parentElement.appendChild(this.prevArrow);

    }

    Carousel.removeArrow = function () {
        this.nextArrow && this.nextArrow.remove();
        this.prevArrow &&  this.prevArrow.remove();
    }


    function getArrow(arrowName){
        var arrow = getRawArrow();
        arrow.classList.add(arrowName);
        return arrow;

        function getRawArrow() {
            var div =  document.createElement('div');
            div.classList.add('arrow');
            return div;
        }
    }



    /**
     * When destroyed, remove the transform CSS from the carousel element and its faces.
     */
    Carousel.destroy = function () {
        var carousel = this,
            faces = this.faces;

        carousel.element.style[Static.TRANSFORM_PROPNAME] = "";
        faces.forEach(function (face) {
            face.style[Static.TRANSFORM_PROPNAME] = "";
        });
        carousel.removeArrow();
        this.element.removeEventListener('mouseout', this.mouseoutHandler);
        this.element.removeEventListener('mouseover',this.mouseoverHandler);
        this.unbind();
    };
});