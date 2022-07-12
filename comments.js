/* global snoowrap, Highcharts */
var REDDIT_APP_ID = 'R7NdC-SvRV45Uw';
var REDIRECT_URI = 'https://timendum.github.io/reddit-commented-thread/';
var REQUIRED_SCOPES = ['read', 'identity'];
var USER_AGENT = 'reddit most commented thread by /u/timendum';
var FORM_CONFIGS = [
    'reddit-url', 'pieComments', 'scatterSubmissions',
    'scatterMaxX', 'scatterMaxY', 'filter-multireddit', 'logaritmic'
];
let COLORS = [
    [51, 102, 204],
    [220, 57, 18],
    [255, 153, 0],
    [16, 150, 24],
    [153, 0, 153],
    [59, 62, 172],
    [0, 153, 198],
    [221, 68, 119],
    [102, 170, 0],
    [184, 46, 46],
];
let SUBREDDITS_COLOR = {};

function arrayToColor(color, fading) {
    return '#' + color.map(function (obj) {
        return Math.round(obj + (255 - obj) * fading).toString(16).toUpperCase().padStart(2, '0');
    }).join('');
}

var cachedReddit = null;

(function (H) {
    // Pass error messages
    H.Axis.prototype.allowNegativeLog = true;
    H.Axis.prototype.log2lin = function (num) {
        var isNegative = num < 0,
            adjustedNum = Math.abs(num),
            result;
        if (adjustedNum < 2) {
            adjustedNum += (2 - adjustedNum) / 2;
        }
        result = Math.log(adjustedNum) / Math.LN10;
        return isNegative ? -result : result;
    };
    H.Axis.prototype.lin2log = function (num) {
        var isNegative = num < 0,
            absNum = Math.abs(num),
            result = Math.pow(10, absNum);
        if (result < 2) {
            result = (2 * (result - 1)) / (2 - 1);
        }
        return isNegative ? -result : result;
    };
}(Highcharts));

function setError(message) {
    var div = document.getElementById('url-error-message');
    if (message) {
        div.innerHTML = message;
        div.classList.remove('hidden');
    } else {
        div.classList.add('hidden');
    }
}

function getAuthRedirect() {
    return snoowrap.getAuthUrl({
        clientId: REDDIT_APP_ID,
        scope: REQUIRED_SCOPES,
        redirectUri: REDIRECT_URI,
        state: saveForm(),
        permanent: false
    });
}

function parseUrl(url) {
    var matches = url.match(/(?:^:https?:\/\/)?(?:\w*\.)?reddit\.com\/((?:r\/\w{1,21})|(?:me\/m\/\w{1,21})|(?:u(?:ser)?\/\w{1,21}\/m\/\w{1,21}))\//);
    if (matches) {
        return matches[1];
    }
    throw new TypeError('Please enter the URL of a subreddit or a multireddit, ending with /.');
}

function selectPieHandler(e) {
    if (e.point.subreddit && e.point.linkId) {
        var subreddit = e.point.subreddit;
        var id = e.point.linkId.replace(/^t3_/, '');
        var url = `https://www.reddit.com/r/${subreddit}/comments/${id}/_/`;
        window.open(url, id);
    } else {
        var url = document.getElementById('reddit-url').value;
        window.open(url, url);
    }
}

function createPieDataTimeDependant(comments) {
    var chartData = [];
    var now = (new Date()).getTime() / 1000;
    for (var comment of comments) {
        var updated = false;
        var deltaTime = (now - comment.created_utc) / 60 / 60;
        var value = 1 / (Math.pow(deltaTime, 2) / 5 + 1);
        for (var cd of chartData) {
            if (cd.name === comment.link_title) {
                cd.y += value;
                cd.numComments += 1;
                updated = true;
                break;
            }
        }
        if (!updated) {
            chartData.push({
                name: comment.link_title,
                y: value,
                numComments: 1,
                subreddit: comment.subreddit.display_name,
                linkId: comment.link_id
            });
        }
    }
    chartData.sort(function (a, b) {
        return b.y - a.y;
    });
    window.pieData = chartData;
    return addCustomLabelPieData(chartData);
}

function addCustomLabelPieData(chartData) {
    function sumReduce(accumulator, currentValue) {
        return accumulator + currentValue;
    }
    const total = chartData.map(el => el.y).reduce(sumReduce);
    const tooSmallIndex = chartData.findIndex(function (element) {
        return element.y < total * 0.02;
    });
    let smallElems = chartData.splice(tooSmallIndex);
    chartData.push({
        name: 'Others',
        color: '#B5B5B5',
        y: smallElems.map(el => el.y).reduce(sumReduce),
        numComments: smallElems.map(el => el.numComments).reduce(sumReduce),
        subreddit: null,
        linkId: null
    });
    chartData.forEach(function (elem, index) {
        if (elem.y < total * 0.03) {
            elem.dataLabels = {enabled: false};
        }
    });
    return chartData;
}

function plotPie(comments) {
    try {
        Highcharts.chart('pie_div', {
            chart: {
                plotBackgroundColor: null,
                plotBorderWidth: null,
                plotShadow: false,
                type: 'pie'
            },
            title: {
                text: 'Topic hotness by comment number'
            },
            plotOptions: {
                pie: {
                    events: {
                        click: selectPieHandler
                    },
                    cursor: 'pointer',
                    dataLabels: {
                        enabled: true,
                        distance: -50,
                        format: '{percentage:.1f}%',
                        style: {
                            fontWeight: 'normal'
                        }
                    }
                }
            },
            tooltip: {
                pointFormat: 'Comments: {point.numComments} ({point.percentage:.1f}%)</b>'
            },
            series: [{data: createPieDataTimeDependant(comments)}],
            credits: false
        });
    } catch (e) {
        console.log(e);
        setError('Error during the creation of the pie chart');
    }
}

function selectHandler(e) {
    console.log(e);
    if (e.point.threadId && e.point.permalink) {
        const id = e.point.threadId;
        const permalink = e.point.permalink;
        const url = `https://www.reddit.com${permalink}`;
        window.open(url, id);
    }
}

function filterThreadsData(threads) {
    let distance = {};
    // init subreddits
    for (let thread of threads) {
        distance[thread.subreddit_id] = [];
    }
    if (Object.keys(distance).length === 1) {
        return threads;
    }
    // calculate real distance
    for (let thread of threads) {
        distance[thread.subreddit_id].push(Math.pow(thread.score, 2) +
                                           Math.pow(thread.num_comments, 2));
    }
    let dlimit = {};
    for (let subredditId of Object.keys(distance)) {
        let values = distance[subredditId];
        dlimit[subredditId] = values.sort((a, b) => a - b)[Math.floor(values.length / 2)] * 0.75;
    }
    let fthreads = [];
    for (let thread of threads) {
        if (dlimit[thread.subreddit_id] < Math.pow(thread.score, 2) +
                                          Math.pow(thread.num_comments, 2)) {
            fthreads.push(thread);
        }
    }
    return fthreads;
}

function createPointsData(threads, maxValues, minValues) {
    let chartData = {};
    let now = (new Date()).getTime() / 1000;
    for (let thread of threads) {
        const subreddit = thread.subreddit.display_name;
        let deltaTime = (now - thread.created_utc) / 60 / 60;
        // a value beween 1 and 0.3, to fade the point color
	if (document.getElementById('logaritmic').checked) {
		let fading = Math.max(1 - 1 / (Math.pow(deltaTime, 2) / 100 + 1), 0.3);
	} else {
		let fading = Math.max(1 - 1 / (deltaTime / 10 + 1), 0.3);
	}
        let subredditColor = SUBREDDITS_COLOR[subreddit];
        if (!subredditColor) {
            subredditColor = COLORS.shift();
            SUBREDDITS_COLOR[subreddit] = subredditColor;
            COLORS.push(subredditColor);
        }
        let color = arrayToColor(subredditColor, fading);
        chartData[subreddit] = chartData[subreddit] || [];
        chartData[subreddit] .push({
            x: Math.max(Math.min(thread.score, maxValues[0]), minValues[0]),
            y: Math.max(Math.min(thread.num_comments, maxValues[1]), minValues[1]),
            name: thread.title,
            score: thread.score,
            threadId: thread.id,
            permalink: thread.permalink,
            numComments: thread.num_comments,
            color: color
        });
    }
    return Object.keys(chartData).map(function (key) {
        return {name: key, data: chartData[key], color: arrayToColor(SUBREDDITS_COLOR[key], 0)};
    });
}

function plotPoints(threads) {
    threads.reverse();
    var maxX = document.getElementById('scatterMaxX').value;
    maxX = parseInt(maxX, 10);
    var maxY = document.getElementById('scatterMaxY').value;
    maxY = parseInt(maxY, 10);
    if (document.getElementById('filter-multireddit').checked) {
        threads = filterThreadsData(threads);
    }
    let axisType = "linear";
	let minValues = [-Infinity, -Infinity];
    if (document.getElementById('logaritmic').checked) {
        axisType = "logarithmic";
		minValues = [1, 1];
    }
    var chartData = createPointsData(threads, [maxX || Infinity, maxY || Infinity], minValues);
    Highcharts.chart('points_div', {
        chart: {
            type: 'scatter',
            zoomType: 'xy'
        },
        title: {
            text: ''
        },
        xAxis: {
            title: {
                enabled: true,
                text: 'Score'
            },
            type: axisType,
            minRange: 0,
            endOnTick: true,
            showLastLabel: true
        },
        yAxis: {
            title: {
                enabled: true,
                text: 'Comments'
            },
            type: axisType,
            minRange: 0,
            startOnTick: true,
            endOnTick: true,
            showLastLabel: true
        },
        plotOptions: {
            scatter: {
                events: {
                    click: selectHandler
                },
                cursor: 'pointer',
                tooltip: {
                    pointFormat: '<strong>{point.name}</strong><br/>' +
                                 'Score {point.x} - Comments: {point.y}'
                }
            }
        },
        series: chartData,
        credits: false
    });
}

function createChart(url) {
    var accessToken = getAccessToken();
    var button = document.getElementById('submit');
    var pieLimit = parseInt(document.getElementById('pieComments').value, 10);
    var scatterLimit = parseInt(document.getElementById('scatterSubmissions').value, 10);
    button.textContent = button.dataset.loadingText;
    if (accessToken) {
        button.setAttribute('disabled', 'disabled');
        accessToken.then(function (token) {
            return getReddit(token);
        }).then(function (reddit) {
            return reddit._getListing({uri: url + '/comments', qs: {limit: pieLimit}});
        }).then(
            plotPie
        ).catch(function (e) {
            console.log(e);
            setError('Error reading data from Reddit.');
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('accessTokenDate');
            /* eslint-disable no-native-reassign */
            location = getAuthRedirect();
            return null;
        }).then(function () {
            // get cached istance
            return getReddit(null);
        })
        .then(function (reddit) {
            return reddit._getListing({uri: url + '/new', qs: {limit: scatterLimit}});
        }).catch(function (e) {
            console.log(e);
            setError('Error reading data from Reddit.');
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('accessTokenDate');
            /* eslint-disable no-native-reassign */
            location = getAuthRedirect();
            return null;
        }).then(
            plotPoints
        ).catch(console.log)
        .then(function () {
            button.removeAttribute('disabled');
            button.textContent = button.dataset.originalText;
        });
    } else {
        /* eslint-disable no-native-reassign */
        location = getAuthRedirect();
    }
    return false;
}

function getReddit(accessToken) {
    if (cachedReddit) {
        return cachedReddit;
    }
    /* eslint-disable new-cap */
    cachedReddit = new snoowrap({userAgent: USER_AGENT, accessToken: accessToken});
    return cachedReddit;
}

function onSubmit(evt) {
    if (evt) {
        evt.preventDefault();
    }
    var url = document.getElementById('reddit-url').value;
    var parsedUrl;
    try {
        parsedUrl = parseUrl(url);
    } catch (err) {
        setError(err.message);
        throw err;
    }
    setError(null);
    sessionStorage.formConfig = saveForm();
    createChart(parsedUrl);
}

function getAccessToken() {
    if (sessionStorage.accessToken) {
        // no authCode but accessToken
        try {
            var accessTokenDate = sessionStorage.accessTokenDate;
            if (accessTokenDate) {
                if (new Date() - Date.parse(accessTokenDate) < 1000 * 60 * 60) {
                    return Promise.resolve(sessionStorage.accessToken);
                }
                sessionStorage.removeItem('accessToken');
                sessionStorage.removeItem('accessTokenDate');
            }
        } catch (e) {
            // ok
        }
    }
    var authCode = new URL(window.location.href).searchParams.get('code');
    if (authCode) {
        // remove old accessToken
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessTokenDate');
        return snoowrap.fromAuthCode({
            code: authCode,
            userAgent: USER_AGENT,
            clientId: REDDIT_APP_ID,
            redirectUri: REDIRECT_URI
        }).then(function (reddit) {
            cachedReddit = reddit;
            sessionStorage.accessToken = reddit.accessToken;
            sessionStorage.accessTokenDate = new Date();
            return reddit.accessToken;
        }, function () {
            /* eslint-disable no-native-reassign */
            location = getAuthRedirect();
        });
    }

    return null;
}

function onAdvanced() {
    var hidden = !this.checked;
    for (let elem of document.getElementsByClassName('form-advanced')) {
        elem.hidden = hidden;
    }
}

function saveForm() {
    var config = {};
    for (let id of FORM_CONFIGS) {
        if (document.getElementById(id).type === "checkbox") {
            config[id] = document.getElementById(id).checked;
        } else {
            config[id] = document.getElementById(id).value;
        }
    }
    return JSON.stringify(config);
}

function restoreForm(formConfig) {
    if (!formConfig) {
        return;
    }
    var config = JSON.parse(formConfig);
    for (let id of FORM_CONFIGS) {
        let value = config[id];
        if (value !== undefined) {
            if (document.getElementById(id).type === "checkbox") {
                document.getElementById(id).checked = value;
            } else {
                document.getElementById(id).value = value;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    restoreForm(sessionStorage.formConfig);
    var authState = new URL(window.location.href).searchParams.get('state');
    if (authState) {
        restoreForm(authState);
        var authCode = new URL(window.location.href).searchParams.get('code');
        if (authCode) {
            onSubmit();
        }
    }
    document.getElementById('main-form').addEventListener('submit', onSubmit);
    document.getElementById('advanced-form').addEventListener('change', onAdvanced);
    document.getElementById('advanced-form').checked = false;
});
