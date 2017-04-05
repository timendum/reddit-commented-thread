/* global snoowrap, google */
var REDDIT_APP_ID = 'R7NdC-SvRV45Uw';
var REDIRECT_URI = 'https://timendum.github.io/reddit-commented-thread/';
var REQUIRED_SCOPES = ['read', 'identity'];
var USER_AGENT = 'reddit most commented thread by /u/timendum';

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

function selectPieHandler(chart, data) {
    return function (a) {
        var selection = chart.getSelection();
        chart.setSelection(null);
        var subreddit = data.getValue(selection[0].row, 3);
        var id = data.getValue(selection[0].row, 2).replace(/^t3_/, '');
        var url = `https://www.reddit.com/r/${subreddit}/comments/${id}//`;
        window.open(url, id);
    };
}

function createPieDataTimeDependant(comments) {
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

function plotPie(comments) {
    google.charts.setOnLoadCallback(function () {
        try {
            var chartData = createPieDataTimeDependant(comments);
            var data = google.visualization.arrayToDataTable(chartData);
            data.sort({column: 1, desc: true});
            var options = {'pieHole': 0.4,
                'sliceVisibilityThreshold': 0.02,
                'chartArea': {'width': '90%', 'height': '90%'},
                'width': 400,
                'height': 400,
                'legend': 'none'};
            var chart = new google.visualization.PieChart(document.getElementById('pie_div'));
            chart.draw(data, options);
            google.visualization.events.addListener(chart, 'select', selectPieHandler(chart, data));
        } catch (e) {
            console.log(e);
            setError('Error during the creation of the pie chart');
        }
    });
}

function selectHandler(chart, threads) {
    return function (a) {
        var selection = chart.getSelection();
        chart.setSelection(null);
        let thread = threads[selection[0].row];
        let permalink = thread.permalink;
        let id = thread.id;
        var url = `https://www.reddit.com${permalink}`;
        window.open(url, id);
    };
}

function createPointsData(threads, maxValues) {
    let chartData = [[
        'Score',
        'Comments',
        {'type': 'string', 'role': 'tooltip'},
        {'type': 'string', 'role': 'style'}
    ]];
    let now = (new Date()).getTime() / 1000;
    for (let thread of threads) {
        let deltaTime = (now - thread.created_utc) / 60 / 60;
        let value = 1 / (Math.pow(deltaTime, 2) / 200 + 1);
        let color = [51, 102, 204].map(function (obj) {
            return Math.round(obj + (255 - obj) * (0.9 - value)).toString(16);
        }).join('');
        chartData.push([
            Math.min(thread.score, maxValues[0]),
            Math.min(thread.num_comments, maxValues[1]),
            `${thread.title}\n (Score: ${thread.score} - Comments: ${thread.num_comments})`,
            `point {fill-color: #${color}}`
        ]);
    }
    return chartData;
}

function plotPoints(threads) {
    threads.reverse();
    var maxX = document.getElementById('scatterMaxX').value;
    maxX = parseInt(maxX, 10);
    var maxY = document.getElementById('scatterMaxY').value;
    maxY = parseInt(maxY, 10);
    google.charts.setOnLoadCallback(function () {
        var chartData = createPointsData(threads, [maxX || Infinity, maxY || Infinity]);
        var data = google.visualization.arrayToDataTable(chartData);

        var options = {
            'colors': ['#3366cc'],
            'chartArea': {'width': '90%', 'height': '90%'},
            'hAxis': {'minValue': 0, 'maxValue': maxX},
            'vAxis': {'minValue': 0, 'maxValue': maxY},
            'width': 500,
            'height': 300,
            'legend': 'none'};
        var chart = new google.visualization.ScatterChart(document.getElementById('points_div'));
        chart.draw(data, options);
        google.visualization.events.addListener(chart, 'select', selectHandler(chart, threads));
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
        }).then(function (reddit) {
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
        ).catch(console.log).then(function () {
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

function onAdvancedClicked() {
    var hidden = !this.checked;
    for (let elem of document.getElementsByClassName('form-advanced')) {
        elem.hidden = hidden;
    }
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
    document.getElementById('advanced-form').addEventListener('click', onAdvancedClicked);
});
