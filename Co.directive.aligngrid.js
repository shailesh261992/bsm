/*jshint: browser: true*/
/*global Co */
Co.directive("aligngrid", function () {
    "use strict";

    var AlignGrid = this;

    //there are two modes.
    //1. Row Specific : Which will align items with respect to row in viewport
    //2. Normalize Grid : Which will align items respective to all other corresponding items in grid. Using this mode for carousel

    AlignGrid.init = function init(element, options) {
        this.setOptions(options);
        this.element = element;
        var children = Array.from(element.children);
        var child = this.child;
        this.allElements = Array.from(element.querySelectorAll(this.selectors))
            .filter(function (cell) {
                // Filter out elements that were included due to nesting which should not
                // be part of this instance.
                return !child || children.indexOf(cell.closest(child)) > -1;
            });
        this.selectors = this.selectors.split(',').map(function (str) {
            return str.trim();
        });
        var heightProperty = this.normalizeGrid ? 'scrollHeight' : 'offsetHeight'; // In case of carousel we are using scrollHeight due to usage of absolute elements
        this.grid = new Grid(this.element, this.selectors, this.allElements, heightProperty,child);
        if (this.normalizeGrid) {
            this.grid.activateGrid = this.grid.normalizeGrid;
        } else {
            this.grid.activateGrid = this.grid.rowSpecificGrid;
        }

        this.grid.init();

    };

    AlignGrid.update = function () {
        this.grid.update();
    };

    AlignGrid.partialUpdate = function () {
        this.grid.activateGrid();
    }

    AlignGrid.partialUpdate.context = "element";
    AlignGrid.partialUpdate.event = "carouselUpdated";

    AlignGrid.destroy = function () {
        this.grid && this.grid.resetGridHeight();
    }

    function Grid(element, selectors, elements, heightProperty,child) {
        this.element = element;
        this.elements = elements;
        this.selectors = selectors;
        this.heightProperty = heightProperty;
        this.child = child;
        this.rows = this.createGridRows(this.selectors, this.elements);


    }

    Grid.prototype.getElementWithSelector = function (selector) {
        var children = Array.from(this.element.children);
        var child = this.child;
        return Array.from(this.element.querySelectorAll(selector))
            .filter(function (cell) {
                // Filter out elements that were included due to nesting which should not
                // be part of this instance.
                return !child || children.indexOf(cell.closest(child)) > -1;
            });
    }

    Grid.prototype.init = function () {
        this.activateGrid();
    };

    Grid.prototype.update = function () {
        var grid = this;
        this.resetGridHeight();
        setTimeout(function () {
            grid.rows = grid.createGridRows(grid.selectors, grid.elements);
            grid.activateGrid();
        }, 1);
    };

    Grid.prototype.resetGridHeight = function () {
        var grid = this;
        this.selectors.forEach(function (selector) {
            grid[selector].rows.forEach(function (row) {
                row.resetHeight();
            })
        });
    };

    Grid.prototype.rowSpecificGrid = function () {
        var grid = this;
        var allRows = [];

        this.selectors.forEach(function (selector) {
            grid[selector].rows.forEach(function (row) {
                row.getHeight().then(function (height) {
                    row.setHeightAI(height);
                })
            })
        });
    };

    Grid.prototype.normalizeGrid = function () {
        var grid = this;

        this.selectors.forEach(function (selector) {
            grid[selector].normalizeHeight = grid[selector].normalizeHeight || 1;
            grid[selector].rows.forEach(function (row) {
                row.getHeight().then(function (height) {
                    if (height > grid[selector].normalizeHeight) {
                        grid[selector].normalizeHeight = height;
                        grid.setNormalizeHeight(height, selector);
                    }
                })

            })
        });

    }

    Grid.prototype.setNormalizeHeight = function (height, selector) {
        this[selector].rows.forEach(function (row) {
            row.setHeightAI(height);
        });
    }

    Grid.prototype.createGridRows = function (selectors, elements) {
        var grid = this;
        var elementsCountInRow = this.getNumberOfElementsInSingleGridRow(selectors, elements);
        var rows, elementsWithClassName, rowElements;
        selectors.forEach(function (selector) {
            rows = [];
            elementsWithClassName = grid.getElementWithSelector(selector);
            for (var k = 0; k < elementsWithClassName.length; k = (k + elementsCountInRow)) {
                rowElements = elementsWithClassName.slice(k, k + elementsCountInRow);
                rows.push(new Row(rowElements, grid.heightProperty));
            }
            grid[selector] = {rows: rows};
        });
    };

    Grid.prototype.isElementCompletelyVisibleInViewport = function (element) {
        var rect = element.getBoundingClientRect();
        var viewport = Util.getViewPortDimensions();
        var rightEdgeVisibleInViewport = rect.right >= viewport.left && rect.right <= viewport.right;
        var leftEdgeVisibleInVieport = rect.left >= viewport.left && rect.left <= viewport.right;
        return (rightEdgeVisibleInViewport && leftEdgeVisibleInVieport);
    };

    Grid.prototype.getNumberOfElementsInSingleGridRow = function (selectors, elements) {
        var grid = this, similarElements;
        var selectorToDecideRowElementCount = selectors[0];
        similarElements = this.getElementWithSelector(selectorToDecideRowElementCount).filter(function (element) {
            return grid.isElementCompletelyVisibleInViewport(element);
        });
        var i, e, rect, start = 0, count = 0;
        for (i = 0; i < similarElements.length; i++) {
            e = similarElements[i];
            rect = e.getBoundingClientRect();
            if (rect.left >= start) {
                start = rect.left;
                count++;
            } else {
                break;
            }
        }
        if (count == 0) {
            return 1; //default value to return;
        }
        return count;
    };


    function Row(elements, heightProperty) {
        this.elements = elements.map(function (element) {
            return new RowElement(element, heightProperty);
        });
    };

    Row.prototype.getHeight = function () {
        var elements = this.elements;
        var heightsOfAllElements = elements.map(function (element) {
            return element.getHeight();
        })
        var height = Promise.all(heightsOfAllElements).then(function (values) {
            values.push[0];
            return Math.max.apply(null, values);
        })
        return height;
    };

    Row.prototype.setHeight = function (height) {
        this.elements.forEach(function (element) {
            element.setHeight(height);
        })
    };

    Row.prototype.setHeightAI = function (height) {
        var row = this;
        if (Util.isScrolling()) {
            setTimeout(function () {
                row.setHeightAI(height);
            }, 1)
        } else {
            row.setHeight(height);
        }
    };

    Row.prototype.resetHeight = function () {
        this.elements.forEach(function (element) {
            element.resetHeight();
        })
    };

    function RowElement(element, heightProperty) {
        this.approximateHeight = 0;
        this.element = RowElement.getCompletelyLoadedElement(element);
        this.orignalElement = element;
        this.heightProperty = heightProperty;
    };

    RowElement.prototype.getHeightAI = function (resolve) {
        var rowElement = this;
        if (Util.isScrolling()) {
            setTimeout(function () {
                rowElement.getHeightAI(resolve);
            }, 100);
        } else {
            setTimeout(function () {
                var offsetHeight = rowElement.orignalElement[rowElement.heightProperty];
                rowElement.approximateHeight = offsetHeight;
                resolve(offsetHeight);
            }, 1);

        }
    };

    RowElement.prototype.getHeight = function () {
        var rowElement = this;
        var d = defer();
        var elementHeight = this.element.then(function (element) {
            rowElement.getHeightAI(d.resolve)
            return d.promise;
        });
        return elementHeight;
    };

    RowElement.prototype.resetHeight = function () {
            var rowElement = this;
            requestAnimationFrame(function () {
                if (rowElement.orignalElement.style.minHeight) {
                    rowElement.orignalElement.style.minHeight = '';
                }
        })
    };

    RowElement.prototype.setHeight = function (height) {
        var rowElement = this;
        if (this.isNecessaryToSetHeight(height)) {
            setTimeout(function () {
                requestAnimationFrame(function () {
                    rowElement.approximateHeight = height;
                    rowElement.orignalElement.style.minHeight = height + 'px';
                })
            }, 100);
        }
    };

    RowElement.prototype.isNecessaryToSetHeight = function (height) {
        var diffInHeightThreshold = 0.1;
        var diffInHeight = Math.abs(this.approximateHeight - height);
        if (diffInHeight > diffInHeightThreshold || this.heightProperty == 'scrollHeight') {
            return true;
        } else {
            return false;
        }
    };

    RowElement.getCompletelyLoadedElement = function (element) {
        var completelyLoadedElement;
        var images = Util.getAllImagesInsideElement(element);
        if (images.length > 0) {
            var isAllImagesLoadCompleted = [], isImageLoadCompleted;
            images.forEach(function (img) {
                isImageLoadCompleted = new Promise(function (resolve, reject) {
                    if (Util.isImageLoadCompleted(img)) {
                        resolve(true);
                    }
                    else {
                        Co.on(img, 'imgLoadedSuccess imgLoadError', function () {
                            setTimeout(function () {
                                resolve(true);
                            }, 1);
                        });
                    }
                });
                isAllImagesLoadCompleted.push(isImageLoadCompleted);
            });

            completelyLoadedElement = new Promise(function (resolve, reject) {
                Promise.all(isAllImagesLoadCompleted).then(function () {
                    resolve(element);
                });
            });

        }
        else {
            completelyLoadedElement = Promise.resolve(element);
        }
        return completelyLoadedElement;
    };


    function Util() {
    };


    Util.isImageLoadCompleted = function (img) {
        return img.complete && (!img.hasAttribute("lazyload") ? true : ((img.classList && (img.classList.contains("co-lazy-loaded") || img.classList.contains("co-lazy-error"))) ? true : false));
    };

    Util.getAllImagesInsideElement = function (element) {
        return Array.from(element.querySelectorAll('img'));
    };

    Util.getIndexOfChildren = function (child) {
        var parent = child.parentNode;
        var children = parent.children;
        var i = children.length - 1;
        for (; i >= 0; i--) {
            if (child == children[i]) {
                break;
            }
        }
        return i;
    };

    Util.isScrolling = (function () {
        var timeout;
        var isScrolling = false;
        window.addEventListener('scroll', function () {
            clearTimeout(timeout);
            isScrolling = true;
            timeout = setTimeout(function () {
                isScrolling = false;
            }, 150);
        });
        return function () {
            return isScrolling;
        }
    })();

    Util.getViewPortDimensions = function () {
        return {
            right: (window.innerWidth || document.documentElement.clientWidth) + 20,
            left: -20
        };
    };

    function defer() {
        var resolve, reject;
        var promise = new Promise(function () {
            resolve = arguments[0];
            reject = arguments[1];
        });
        return {
            resolve: resolve,
            reject: reject,
            promise: promise
        };
    };
});


