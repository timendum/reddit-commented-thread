/* global snoowrap, google */
var REDDIT_APP_ID = 'R7NdC-SvRV45Uw';
var REDIRECT_URI = 'https://timendum.github.io/reddit-commented-thread/';
var REQUIRED_SCOPES = ['read', 'identity'];
var USER_AGENT = 'reddit most commented thread by /u/timendum';
var GET_LIMIT = 200;

var cachedReddit = null;

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
        state: document.getElementById('reddit-url').value,
        permanent: false
    });
}

function parseUrl(url) {
    var matches = url.match(/(?:^:https?:\/\/)?(?:\w*\.)?reddit\.com\/((?:r\/\w{1,21})|(?:me\/m\/\w{1,21})|(?:u(?:ser)?\/\w{1,21}\/m\/\w{1,21}))\//);
    if (matches) {
        return matches[1];
    }
    throw new TypeError('Invalid URL. Please enter the URL of a subreddit or a multireddit.');
}

function selectHandler(chart, data) {
    return function (a) {
        var selection = chart.getSelection();
        chart.setSelection(null);
        var subreddit = data.getValue(selection[0].row, 3);
        var id = data.getValue(selection[0].row, 2).replace(/^t3_/, '');
        var url = `https://www.reddit.com/r/${subreddit}/comments/${id}//`;
        window.open(url, id);
    };
}

function createPlotDataTimeDependant(comments) {
    var chartData = [[
        'Thread',
        'Score',
        'Link Id',
        'Subreddit',
        'Comments']];
    var now = (new Date()).getTime() / 1000;
    for (var comment of comments) {
        var updated = false;
        var deltaTime = (now - comment.created_utc) / 60 / 60;
        var value = 1 / (Math.pow(deltaTime, 2) / 5 + 1);
        for (var cd of chartData) {
            if (cd[2] === comment.link_id) {
                cd[1] += value;
                cd[4] += 1;
                updated = true;
                break;
            }
        }
        if (!updated) {
            chartData.push([
                comment.link_title,
                value,
                comment.link_id,
                comment.subreddit.display_name,
                1
            ]);
        }
    }
    return chartData;
}

function plot(comments) {
    google.charts.setOnLoadCallback(function () {
        var chartData = createPlotDataTimeDependant(comments);
        var data = google.visualization.arrayToDataTable(chartData);
        data.sort({column: 1, desc: true});
        var options = {'pieHole': 0.4,
            'sliceVisibilityThreshold': 0.02,
            'width': 900,
            'height': 500,
            'legend': 'none'};
        var chart = new google.visualization.PieChart(document.getElementById('chart_div'));
        chart.draw(data, options);
        google.visualization.events.addListener(chart, 'select', selectHandler(chart, data));
    });
}

function createChart(url) {
    var accessToken = getAccessToken();
    var button = document.getElementById('submit');
    if (accessToken) {
        button.setAttribute('disabled', 'disabled');
        accessToken.then(function (token) {
            return getReddit(token);
        }).then(function (reddit) {
            return reddit._getListing({uri: url + '/comments', qs: {limit: GET_LIMIT}});
        }).then(
            plot
        ).catch(function (e) {
            console.log(e);
            setError('Error reading data from Reddit.');
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('accessTokenDate');
            /* eslint-disable no-native-reassign */
            location = getAuthRedirect();
            return null;
        })
         .then(function () {
             button.removeAttribute('disabled');
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

function onSubmitClicked() {
    var url = document.getElementById('reddit-url').value;
    var parsedUrl;
    try {
        parsedUrl = parseUrl(url);
    } catch (err) {
        setError(err.message);
        throw err;
    }
    setError(null);
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

document.addEventListener('DOMContentLoaded', function () {
    var authState = new URL(window.location.href).searchParams.get('state');
    if (authState) {
        document.getElementById('reddit-url').value = authState;
        var authCode = new URL(window.location.href).searchParams.get('code');
        if (authCode) {
            onSubmitClicked();
        }
    }
    google.charts.load('current', {'packages': ['corechart']});
    document.getElementById('submit').addEventListener('click', onSubmitClicked);
});
