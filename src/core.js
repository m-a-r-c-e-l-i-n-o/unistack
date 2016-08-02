'use strict'
import Fs from 'fs-extra'
import Path from 'path'
import _ from 'lodash'
import Argv from 'argv'
import ChildProcess from 'child_process'
import Bundler from 'jspm-dev-builder'
import { Gaze } from 'gaze'
import IO from 'socket.io'
import ServerDestroy from 'server-destroy'
import Minimatch from 'minimatch'
import { createServer as CreateServer } from 'http'
import Config from '../config.js'
import State from './core-state.js'

class UniStack {
    constructor() {
        this.cache = {}
    }
    getState() {
        if (typeof this.cache.state === 'object') {
            return this.cache.state
        }
        return this.cache.state = Object.seal(Object.assign({}, State))
    }
    getSystemConstants() {
        if (typeof this.cache.system === 'object') {
            return this.cache.system
        }
        const unistackPath = Path.join(__dirname, '..')
        const envPath = Config.environment.directory
        return this.cache.system = Object.freeze({
            environment: Object.freeze({
                root: envPath,
                unistack: Object.freeze({
                    root: Path.join(envPath, 'node_modules', 'unistack'),
                }),
            }),
            root: unistackPath
        })
    }
    listenToCLI() {
        const IPC = require('ipc-event-emitter').default
        const state = this.getState()
        const ipc = IPC(process)
        return new Promise((resolve, reject) => {
            state.cli.ipc = ipc
            ipc.fix('core::ready')
            ipc.on('cli::command', (command) => {
                if (command.type === 'terminate') {
                    return resolve(ipc)
                }
                this.handleCommand(command)
            })
        })
    }
    handleCommand(command) {
        switch(command.type) {
            default:
                this.emitEventToCLI({ type: 'command_not_found', data: command })
        }
    }
    emitEventToCLI(data) {
        const state = this.getState()
        state.cli.ipc.emit('core::status', data)
    }
    resolveConfig(filename) {
        return new Promise((resolve, reject) => {
            if (!filename) {
                filename = {}
            }
            if (_.isObject(filename)) {
                return resolve(filename)
            }
            let configWrapper
            const system = this.getSystemConstants()
            const configFilename = Path.join(system.environment.root, filename)
            try {
                configWrapper = require(configFilename)
            } catch (e) {
                return reject({
                    message: 'INVALID_CONFIG_PATH',
                    template: { filename: configFilename }
                })
            }
            const config = Object.seal({
                options: null,
                set: function (opts) {
                   this.options = opts
                }
            })
            configWrapper(config)
            resolve(config.options)
        })
    }
    initSetup() {
        return Promise.resolve()
        .then(() => this.isEnvironmentEmpty())
        .then(() => this.setupPackageJSON())
        .then(() => this.setupEnvironment())
        .then(() => this.installNPMDependencies())
        .then(() => this.installJSPMDependencies())
        .catch(data => this.emitEventToCLI({ type: 'error', data }))
    }
    isEnvironmentEmpty() {
        return new Promise((resolve, reject) => {
            const system = this.getSystemConstants()
            if (Fs.readdirSync(system.environment.root).length > 0) {
                reject({ message: 'INSTALLATION_DIRECTORY_IS_POPULATED' })
            }
            resolve(true)
        })
    }
    setupEnvironment() {
        return new Promise((resolve, reject) => {
            const system = this.getSystemConstants()
            const envPath = system.environment.root
            Fs.copySync(Path.join(system.root, 'environment'), envPath)
            resolve(true)
        })
    }
    setupPackageJSON() {
        return new Promise((resolve, reject) => {
            const system = this.getSystemConstants()
            const unistackBootstrapPath = Path.join(system.root, 'bootstrap')
            const packageJSON = Path.join(unistackBootstrapPath, 'package.json')

            const packageJSONObj = require(packageJSON)
            const jspmConfigFiles = packageJSONObj.jspm.configFiles
            const jspmDirectories = packageJSONObj.jspm.directories

            packageJSONObj.unistack = true

            jspmConfigFiles.jspm = 'node_modules/unistack/bootstrap/jspm.config.js'
            jspmDirectories.packages = 'node_modules/unistack/bootstrap/jspm_packages'

            Fs.writeFileSync(
                Path.join(system.environment.root, 'package.json'),
                JSON.stringify(packageJSONObj, null, '\t')
            )

            resolve(true)
        })
    }
    installNPMDependencies(testCommand) {
        const system = this.getSystemConstants()
        const command = testCommand || "npm install"
        const options = {
            cwd: system.environment.root
        }
        return new Promise((resolve, reject) => {
            ChildProcess.exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(true)
                }
            })
        })
    }
    installJSPMDependencies() {
        const system = this.getSystemConstants()
        const jspm = require('jspm')
        jspm.setPackagePath(system.environment.root)
        return Promise
        .resolve()
        .then(jspm.dlLoader)
        .then(() => jspm.install(true))
    }
    destroyProject() {
        const system = this.getSystemConstants()
        Fs.emptyDirSync(system.environment.root)
    }
    isUnistackEnvironment() {
        return new Promise((resolve, reject) => {
            const system = this.getSystemConstants()
            const envPath = system.environment.root
            const envPackageJSONFile = Path.join(envPath, 'package.json')
            let envPackageJSONObj
            try {
                envPackageJSONObj = require(envPackageJSONFile)
            } catch (e) {
                return reject({ message: 'NO_ENVIRONMENT_PACKAGE_JSON_FILE' })
            }
            if (envPackageJSONObj.unistack) {
                return resolve(true)
            }
            reject({ message: 'NOT_UNISTACK_ENVIRONMENT' })
        })
    }
    startDevEnvironment() {
        return Promise.resolve()
        .then(() => this.isUnistackEnvironment())
        .then(() => this.initNodeBundle())
        .then(() => this.initBrowserBundle())
        .then(() => this.initReloader())
        .then(() => this.watchFiles())
        .then(() => this.runNodeBundle())
        .catch(data => this.emitEventToCLI({ type: 'error', data }))
    }
    stopDevEnvironment() {
        return Promise.resolve()
        .then(() => this.haltNodeBundle())
        .then(() => this.destroyReloader())
        .then(() => this.destroyWatcher())
        .catch(data => this.emitEventToCLI({ type: 'error', data }))
    }
    haltNodeBundle() {
        const state = this.getState()
        return new Promise((resolve, reject) => {
            state.environment.server.destroy(resolve)
        })
    }
    destroyReloader() {
        const state = this.getState()
        return new Promise((resolve, reject) => {
            state.reloader.server.destroy(resolve)
        })
    }
    destroyWatcher() {
        const state = this.getState()
        state.watcher.server.close()
        return Promise.resolve()
    }
    initReloader() {
        const server = CreateServer()
        const io = IO(server)
        return new Promise((resolve, reject) => {
            const state = this.getState()
            server.listen(Config.server.reloaderPort, () => {
                resolve(state.reloader)
            })
            ServerDestroy(server)
            state.reloader.server = server
            state.reloader.io = io
        })
    }
    emitEvent(type, data) {
        const state = this.getState()
        state.reloader.io.emit(type, data)
    }
    rebuildBundles(config) {
        const state = this.getState()
        const bundles = state.environment.bundles
        let promise = Promise.resolve()

        if (config.browser) {
            promise = promise.then(bundles.browser.bundler.build())
        }

        if (config.node) {
            promise = Promise.all([promise, bundles.node.bundler.build()])
            .then(() => {
                if (config.explicitNode) {
                    this.emitEvent('reload')
                }
                return true
            })
        }

        return promise
        .catch(data => this.emitEventToCLI({ type: 'error', data }))
    }
    handleFileChange(filename) {
        const state = this.getState()
        const system = this.getSystemConstants()
        const envSrcPath = Path.join(system.environment.root, 'src')
        const envSrcClientPattern = '{client/*,client/!(test)/**/*}.js'
        const envSrcClientFiles = Path.join(envSrcPath, envSrcClientPattern)
        const envSrcServerPattern = '{server/*,server/!(test)/**/*}.js'
        const envSrcServerFiles = Path.join(envSrcPath, envSrcServerPattern)
        const envSrcSharedPattern = '{shared/*,shared/**}.js'
        const envSrcSharedFiles = Path.join(envSrcPath, envSrcSharedPattern)

        const explicitNode = Minimatch(filename, envSrcServerFiles)
        const shared = Minimatch(filename, envSrcSharedFiles)
        const browser = shared || Minimatch(filename, envSrcClientFiles)
        const node = shared || explicitNode

        if (browser && !explicitNode) {
            this.emitEvent('change', filename)
        }

        let config = { node, browser, explicitNode }
        const throttle = state.environment.bundles.throttle
        if (throttle.timer) {
            clearTimeout(throttle.timer)
            config = throttle.config = {
                node: throttle.config.node || config.node,
                browser: throttle.config.browser || config.browser,
                explicitNode: throttle.config.explicitNode || config.explicitNode
            }
        } else {
            throttle.config = config
        }

        throttle.timer = setTimeout((config => () => {
            throttle.timer = null
            this.rebuildBundles(config)
        })(config), throttle.timeout)
    }
    watchFiles() {
        const state = this.getState()
        const system = this.getSystemConstants()
        const envPath = system.environment.root
        const envUnistackPath = system.environment.unistack.root
        const envBootstrapPath = Path.join(envPath, 'bootstrap')

        const gaze = new Gaze([
            Path.join(envPath, '{*,!(node_modules)/*/!(test),!(node_modules)/*/!(test)/**/*}.+(js|json)'),
            Path.join(envBootstrapPath, '{*,**/*}.+(js|json)')
        ])

        gaze.on('changed', this.handleFileChange.bind(this))

        return new Promise((resolve, reject) => {
            state.watcher.server = gaze
            gaze.on('ready', () => resolve(gaze))
        })
    }
    bundle(entryFile, outputFile, buildOptions) {
        const system = this.getSystemConstants()
        const envPath = system.environment.root
        const envUnistackPath = system.environment.unistack.root
        const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')
        const envJSPMConfigFile = Path.join(envUnistackBootstrapPath, 'jspm.config.js')

        return new Bundler({
            jspm: require('jspm'),
            baseURL: envPath,
            configFile: envJSPMConfigFile,
            expression: entryFile,
            outLoc: outputFile,
            logPrefix: 'unistack-bundler',
            buildOptions: buildOptions
        })
    }
    initNodeBundle(production) {
        const state = this.getState()
        const system = this.getSystemConstants()
        const envPath = system.environment.root
        const envUnistackPath = system.environment.unistack.root
        const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')
        const entryFile = Path.join(envUnistackBootstrapPath, 'server', 'index.js')
        const outputFile = (production ?
            Path.join(envPath, 'dist', 'server.bundle.js') :
            Path.join(envUnistackBootstrapPath, 'server', 'server.bundle.js')
        )
        const buildOptions = {
            sfx: true,
            node: true,
            production: production || false,
            sourceMaps: true
        }
        const bundler = this.bundle(entryFile, outputFile, buildOptions)
        state.environment.bundles.node.bundler = bundler
        return bundler.build().then(() => bundler)
    }
    initBrowserBundle() {
        const state = this.getState()
        const system = this.getSystemConstants()
        const envUnistackPath = system.environment.unistack.root
        const envPath = system.environment.root
        const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')
        const entryFile = Path.join(envUnistackBootstrapPath, 'client', 'index.js')
        const outputFile = Path.join(envPath, 'dist', 'client.bundle.js')
        const buildOptions = {
            sourceMaps: true
        }
        const bundler = this.bundle(entryFile, outputFile, buildOptions)
        state.environment.bundles.browser.bundler = bundler
        return bundler.build().then(() => bundler)
    }
    runNodeBundle() {
        const state = this.getState()
        const system = this.getSystemConstants()
        const envUnistackPath = system.environment.unistack.root
        const envPath = system.environment.root
        const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')
        const serverBundle = Path.join(envUnistackBootstrapPath, 'server', 'server.bundle.js')
        return new Promise((resolve, reject) => {
            const bundle = require(serverBundle).default
            resolve(bundle)
        })
        .then(bundle => bundle.serve)
        .then(server => {
            ServerDestroy(server)
            return state.environment.server = server
        })
    }
}

export default UniStack
