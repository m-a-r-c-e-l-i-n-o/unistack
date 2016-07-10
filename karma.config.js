// Karma configuration
// Generated on Tue Mar 29 2016 10:48:25 GMT-0400 (EDT)
var Path = require('path')
var AppConfig = require('./app.config.js')

var clientCorePath = Path.join('node_modules', 'unistack', 'core')
function mapPreprocessors (files, plugins) {
    var obj = {}
    files.forEach(function(file) { obj[file] = plugins })
    return obj
}
var clientCoreFiles = [
    Path.join(clientCorePath, '{client/!(reloader),client/!(test)/**}.js'),
    Path.join(clientCorePath, 'components/**/*.js'),
    Path.join(clientCorePath, 'shared/**/*.js')
]
var preprocessors = mapPreprocessors(clientCoreFiles, [ 'jspm' ])

module.exports = function(config) {
    config.set({
        basePath: AppConfig.base.directory,
        frameworks: [ 'jspm', 'jasmine' ],
        plugins: [
            'karma-jspm',
            'karma-jasmine',
            'karma-chrome-launcher'
        ],
        jspm: {
            stripExtension: false,
            config: Path.join(clientCorePath, 'jspm.config.js'),
            packages: Path.join(clientCorePath, 'jspm_packages'),
            loadFiles: [
                'src/client/**/*.js',
                'src/shared/**/*.js',
                Path.join(clientCorePath, 'client/index.js'),
                Path.join(clientCorePath, 'client/test/specs/**/*.js'),
                Path.join(clientCorePath, 'components/*.js'),
                Path.join(clientCorePath, 'shared/**/*.js'),
                Path.join(clientCorePath, 'app.config.js')
            ]
        },
        proxies: {
            '/src': '/base/src',
            '/node_modules': '/base/node_modules',
        },
        preprocessors: preprocessors,
        coverageReporter: {
            type : 'html',
            dir : Path.join(process.cwd(), 'core/client/test'),
            subdir: 'coverage'
        },
        reporters: [ 'progress', 'jspm' ],
        port: 9876,
        colors: true,
        debug: false,
        logLevel: config.LOG_INFO,
        autoWatch: false,
        browsers: [ 'Chrome' ],
        singleRun: true,
        concurrency: Infinity
    })
}