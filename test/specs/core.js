import Fs from 'fs-extra'
import Path from 'path'
import IOClient from 'socket.io-client'
import { createServer as CreateServer } from 'http'
import UniStack from '../../src/core.js'
import State from '../../src/core-state.js'
import Config from '../../config.js'
import BDDStdin from '../lib/bdd-stdin.js'
import ServerDestroy from 'server-destroy'

const unistackPath = Path.join(__dirname, '..', '..')
const unistackTmpPath = Path.join(unistackPath, 'tmp')
const unistackEnvPath = Path.join(unistackPath, 'environment')
const envPath = Config.environment.directory
const testPath = Path.join(unistackPath, 'test')
const envUnistackPath = Path.join(envPath, 'node_modules', 'unistack')
const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')
const baseCommand = ['node', 'unistack']
const setupCommand = ['node', 'unistack', '--setup']
const basicConfig = `module.exports = function( config ) {
    config.set({
        hello: 'from mocked unistack.config.js'
    })
}`
const basicPackageJSON = `{
  "name": "basic-app",
  "version": "1.0.0",
  "description": "",
  "main": "unistack.config.js",
  "scripts": {
    "test": "nope"
  },
  "author": "",
  "license": "ISC"
}`

describe ('UniStack', () => {
    it ('should be a function.', () => {
        expect(typeof UniStack).toBe('function')
    })
})

describe ('UniStack constructor()', () => {
    it ('should instantiate a cache object', () => {
        const unistack = new UniStack()
        expect(typeof unistack.cache).toBe('object')
    })
})

describe ('UniStack getState()', () => {
    it ('should return a state object', () => {
        const unistack = new UniStack()
        expect(unistack.getState()).toEqual(State)
    })
    it ('should return a non-extendable object', () => {
        const unistack = new UniStack()
        const state = unistack.getState()
        expect(() => state.hello = 'world')
        .toThrowError('Can\'t add property hello, object is not extensible')
    })
    it ('should cache state object', () => {
        const unistack = new UniStack()
        const state = unistack.getState()
        expect(unistack.getState()).toBe(state)
    })
})

describe ('UniStack getSystemConstants()', () => {
    const unistack = new UniStack()
    const envUnistackPath = Path.join(envPath, 'node_modules', 'unistack')
    const system = unistack.getSystemConstants()
    it ('should return a root property with unistack\'s root path', () => {
        expect(system.root).toBe(unistackPath)
    })
    it ('should return an property with the environment\'s root path', () => {
        expect(system.environment.root).toBe(envPath)
    })
    it ('should return an property with the environment\'s unistack root path', () => {
        expect(system.environment.unistack.root).toBe(envUnistackPath)
    })
})

describe ('UniStack resolveConfig()', () => {
    const unistack = new UniStack()
    it ('should default to an empty object when config is not a string or object', () => {
        expect(unistack.resolveConfig()).toEqual({})
    })
    it ('should return object when an object is passed in', () => {
        const config = {}
        expect(unistack.resolveConfig(config)).toBe(config)
    })
    it ('should resolve a config filename', () => {
        const config = 'unistack.config.js'
        const configFile = Path.join(envPath, config)
        Fs.writeFileSync(configFile, basicConfig)
        expect(unistack.resolveConfig(config)).toEqual({
            hello: 'from mocked unistack.config.js'
        })
        delete require.cache[configFile]
        Fs.removeSync(configFile)
    })
    it ('should throw error when file is not found', () => {
        const config = 'unistack.config.js'
        const configFile = Path.join(envPath, config)
        expect(() => unistack.resolveConfig(config)).toThrowError(
            Config.errors.invalidConfigPath
            .replace('{{filename}}', configFile)
        )
    })
})

describe ('UniStack handleError()', () => {
    const unistack = new UniStack()
    it ('should throw error when error object is present', () => {
        expect(() => unistack.handleError(new Error('Fatal!')))
        .toThrowError('Fatal!')
    })
    it ('should throw error when error string is present', () => {
        expect(() => unistack.handleError('Fatal!')).toThrowError('Fatal!')
    })
    it ('should log warning message when warning option is present', () => {
        const consoleWarn = console.warn
        console.warn = (message) => {
            expect(message).toBe('Warning!')
        }
        const warning = true
        expect(() => unistack.handleError(new Error('Warning!'), { warning }))
        .not.toThrowError()
        console.warn = consoleWarn
    })
    it ('should log warning message when error string and warning option is present', () => {
        const consoleWarn = console.warn
        console.warn = (message) => {
            expect(message).toBe('Warning!')
        }
        const warning = true
        expect(() => unistack.handleError('Warning!', { warning }))
        .not.toThrowError()
        console.warn = consoleWarn
    })
    it ('should call hook before fatal error when a hook function is provided', (done) => {
        const spy = jasmine.createSpy('spy')
        const hook = (error) => {
            spy(error)
            return false
        }
        const error = new Error('Fatal!')
        new Promise((revolve, reject) => {
            reject()
        })
        .catch(e => {
            unistack.handleError(error, { hook })
            expect(spy).toHaveBeenCalledTimes(1)
            expect(spy).toHaveBeenCalledWith(error)
            done()
        })
    })
})

describe ('UniStack throwError()', () => {
    const unistack = new UniStack()
    it ('should throw error', () => {
        expect(() => unistack.throwError(new Error('Fatal!')))
        .toThrowError('Fatal!')
    })
})

describe ('UniStack throwAsyncError()', () => {
    const unistack = new UniStack()
    it ('should throw asynchronous error', (done) => {
        const spy = jasmine.createSpy('spy')
        const error = new Error('Fatal!')
        const MockUniStack = Object.assign({}, UniStack)
        unistack.throwError = (error) => {
            spy(error)
        }
        unistack.throwAsyncError(error)
        setTimeout((spy => {
            return () => {
                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith(error)
                done()
            }
        })(spy), 1)
    })
})

describe ('UniStack validateEnvironmentRoot()', () => {
    const unistack = new UniStack()
    const enviroment = Path.join(unistackPath, 'environment')
    const tmpEnvRename = Path.join(unistackTmpPath, 'environment')
    beforeEach(() => {
        // backup current enviroment
        Fs.renameSync(envPath, tmpEnvRename)
    })
    afterEach(() => {
        // reinstate backup
        Fs.renameSync(tmpEnvRename, envPath)
    })
    it ('should throw error when environment directory is not empty', () => {
        // set up new environment
        Fs.copySync(unistackEnvPath, envPath)
        expect(() => unistack.validateEnvironmentRoot())
        .toThrowError(Config.errors.installationDirectoryIsPopulated)
        // remove new environment
        Fs.removeSync(envPath)
    })
    it ('should remain silent when environment directory is empty', () => {
        // set up new environment
        Fs.ensureDirSync(envPath)
        expect(() => unistack.validateEnvironmentRoot()).not.toThrowError()
        // remove new environment
        Fs.removeSync(envPath)
    })
})

describe ('UniStack initSetup()', () => {
    const unistack = new UniStack()
    unistack.validateEnvironmentRoot = () => {}
    unistack.setupPackageJSON = () => {}
    unistack.setupEnvironment = () => {}
    unistack.installJSPMDependencies = () => Promise.resolve()
    unistack.installNPMDependencies = () => Promise.resolve()

    it ('should return a promise', (done) => {
        const promise = unistack.initSetup(baseCommand)
        expect(typeof promise.then).toBe('function')
        promise.then(answers => done())
    })
    it ('should validate environment directory', () => {
        spyOn(unistack, 'validateEnvironmentRoot')
        unistack.initSetup(baseCommand)
        expect(unistack.validateEnvironmentRoot).toHaveBeenCalledTimes(1)
    })
    it ('should setup a "package.json" file', () => {
        spyOn(unistack, 'setupPackageJSON')
        unistack.initSetup(baseCommand)
        expect(unistack.setupPackageJSON).toHaveBeenCalledTimes(1)
    })
    it ('should files and folders to the environment directory', () => {
        spyOn(unistack, 'setupEnvironment')
        unistack.initSetup(baseCommand)
        expect(unistack.setupEnvironment).toHaveBeenCalledTimes(1)
    })
    it ('should install jspm dependencies', (done) => {
        spyOn(unistack, 'installJSPMDependencies')
        unistack.initSetup(baseCommand)
        .then(() => {
            expect(unistack.installJSPMDependencies).toHaveBeenCalledTimes(1)
            done()
        })
    })
    it ('should install npm dependencies', (done) => {
        spyOn(unistack, 'installNPMDependencies')
        unistack.initSetup(baseCommand)
        .then(() => {
            expect(unistack.installNPMDependencies).toHaveBeenCalledTimes(1)
            done()
        })
    })
    it ('should throw errors if something went wrong', (done) => {
        const error = new Error('fatal')

        let errors = 2
        unistack.handleError = e => { // mock error function
            expect(e).toBe(error)
            if (--errors === 0) {
                done()
            }
        }

        const promiseError = () => Promise.resolve().then(() => { throw error })
        unistack.installNPMDependencies = promiseError
        Promise.resolve()
        .then(() => unistack.initSetup(baseCommand))
        .then(() => {
            unistack.installNPMDependencies = () => Promise.resolve()
            unistack.installJSPMDependencies = promiseError
            return Promise.resolve()
        })
        .then(() => unistack.initSetup(baseCommand))
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
})

describe ('UniStack setupEnvironment()', () => {
    const unistack = new UniStack()
    const enviroment = Path.join(unistackPath, 'environment')
    const tmpEnvRename = Path.join(unistackTmpPath, 'environment')

    beforeEach(() => {
        // backup current enviroment
        Fs.renameSync(envPath, tmpEnvRename)
        // set new enviroment
        Fs.ensureDirSync(envPath)
    })
    afterEach(() => {
        // remove new enviroment
        Fs.removeSync(envPath)
        // reinstate backup
        Fs.renameSync(tmpEnvRename, envPath)
    })
    it ('should copy directories and files to environment directory', () => {
        unistack.setupEnvironment()
        const filenames = [
            Path.join(envPath, 'src','client', 'index.js'),
            Path.join(envPath, 'src','client', 'css', 'preprocessor', 'production.js'),
            Path.join(envPath, 'src','client', 'css', 'preprocessor', 'development.js'),
            Path.join(envPath, 'src','client', 'test', 'specs', 'index.js'),
            Path.join(envPath, 'src','server', 'components', 'layout.js'),
            Path.join(envPath, 'src','server', 'test', 'specs', 'index.js'),
            Path.join(envPath, 'src','server', 'index.js'),
            Path.join(envPath, 'src','shared', 'routes.js'),
            Path.join(envPath, 'src','shared', 'actions', 'index.js'),
            Path.join(envPath, 'src','shared', 'components', '404.js'),
            Path.join(envPath, 'src','shared', 'components', 'App.js'),
            Path.join(envPath, 'src','shared', 'components', 'HelloWorld.js'),
            Path.join(envPath, 'src','shared', 'containers', 'index.js'),
            Path.join(envPath, 'src','shared', 'reducers', 'index.js')
        ]
        filenames.forEach(filename => {
            expect(() => Fs.lstatSync(filename)).not.toThrowError()
        })
    })
})

describe ('UniStack destroyProject()', () => {
    const unistack = new UniStack()
    const enviroment = Path.join(unistackPath, 'environment')
    const tmpEnvRename = Path.join(unistackTmpPath, 'environment')

    beforeEach(() => {
        // backup current enviroment
        Fs.renameSync(envPath, tmpEnvRename)
        // set new (populated) enviroment
        Fs.copySync(tmpEnvRename, envPath)
    })
    afterEach(() => {
        // remove new enviroment
        Fs.removeSync(envPath)
        // reinstate backup
        Fs.renameSync(tmpEnvRename, envPath)
    })
    it ('should empty environment directory', () => {
        unistack.destroyProject()
        expect(Fs.readdirSync(envPath).length).toBe(0)
    })
})

describe ('UniStack.setupPackageJSON()', () => {
    const unistack = new UniStack()
    it ('should copy package.json file to environment directory', () => {
        unistack.setupPackageJSON()
        const packageJSON = Path.join(envPath, 'package.json')
        expect(() => Fs.lstatSync(packageJSON)).not.toThrowError()
        Fs.removeSync(packageJSON)
    })
    it ('should populate jspm asset paths', () => {
        unistack.setupPackageJSON()
        const packageJSON = Path.join(envPath, 'package.json')
        const packageJSONObj = require(packageJSON)
        const jspm = packageJSONObj.jspm
        expect(jspm.configFiles.jspm)
        .toBe('node_modules/unistack/bootstrap/jspm.config.js')
        expect(jspm.directories.packages)
        .toBe('node_modules/unistack/bootstrap/jspm_packages')
        Fs.removeSync(packageJSON)
    })
})

if (!process.env.QUICK_TEST_RUN) {
    describe ('UniStack installNPMDependencies()', () => {
        const unistack = new UniStack()
        const enviroment = Path.join(unistackPath, 'environment')
        const tmpEnvRename = Path.join(unistackTmpPath, 'environment')

        let originalTimeout
        beforeEach(() => {
            originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
            jasmine.DEFAULT_TIMEOUT_INTERVAL = 240000
            // backup current enviroment
            Fs.renameSync(envPath, tmpEnvRename)
            // set new enviroment
            Fs.ensureDirSync(envPath)
        })
        afterEach(() => {
            jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            // remove new enviroment
            Fs.removeSync(envPath)
            // reinstate backup
            Fs.renameSync(tmpEnvRename, envPath)
        })
        it ('should install npm dependencies', (done) => {
            console.log('--Testing installation of NPM dependencies!')
            unistack.validateEnvironmentRoot()
            unistack.setupPackageJSON()
            unistack.installNPMDependencies()
            .then(passed => {
                const packages = Path.join(envPath, 'node_modules')
                expect(passed).toBe(true)
                expect(() => Fs.lstatSync(packages)).not.toThrowError()
                expect(Fs.readdirSync(packages).length).toBeGreaterThan(0)
                done()
            })
            .catch(e => console.log(e.stack)) // catch errors in previous blocks
        })
        it ('should throw errors if something went wrong', (done) => {
            unistack.installNPMDependencies('npm invalid install')
            .catch(e => {
                expect(e instanceof Error).toBe(true)
                done()
            })
        })
    })
}

describe ('UniStack initReloader()', () => {
    it ('should start reloader server', (done) => {
        const unistack = new UniStack()
        unistack.initReloader()
        .then(reloader => {
            expect(typeof reloader.io.emit).toBe('function')
            expect(typeof reloader.io.on).toBe('function')
            reloader.server.destroy(done)
        })
        .catch(e => console.error(e.stack))
    })
    it ('should store the reloader server and io in state object', (done) => {
        const unistack = new UniStack()
        unistack.initReloader()
        .then(reloader => {
            expect(unistack.cache.state.reloader.server).toBe(reloader.server)
            expect(unistack.cache.state.reloader.io).toBe(reloader.io)
            reloader.server.destroy(done)
        })
        .catch(e => console.error(e.stack))
    })
})

describe ('UniStack emitEvent()', () => {
    let originalTimeout
    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
    })
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
    })
    it ('should emit event with data', (done) => {
        const unistack = new UniStack()
        unistack.initReloader()
        .then(reloader => {
            return new Promise((resolve, reject) => {
                reloader.io.on('connection', socket => {
                    resolve()
                })
                const host = 'http://localhost:' + Config.server.reloaderPort
                const clientSocket = IOClient.connect(host, {
                    'reconnection delay' : 0,
                    'reopen delay' : 0,
                    'force new connection' : true
                })
                clientSocket.once('echo', data => {
                    expect(data).toBe('hello')
                    reloader.server.destroy(done)
                })
            })
        })
        .then(() => unistack.emitEvent('echo', 'hello'))
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
})

describe ('UniStack rebuildBundles()', () => {
    let originalTimeout
    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
    })
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
    })
    it ('should only rebuild browser bundle', (done) => {
        const unistack = new UniStack()
        const browserSpy = jasmine.createSpy('browserSpy')
        const nodeSpy = jasmine.createSpy('nodeSpy')
        // mock bundler
        unistack.cache.state = {
            environment: {
                bundles: {
                    browser: {
                        bundler: {
                            build: () => Promise.resolve(browserSpy('browser'))
                        }
                    },
                    node: {
                        bundler: {
                            build: () => Promise.resolve(nodeSpy('node'))
                        }
                    }
                }
            }
        }
        unistack.rebuildBundles({ browser: true })
        .then(() => {
            expect(browserSpy).toHaveBeenCalledTimes(1)
            expect(browserSpy).toHaveBeenCalledWith('browser')
            expect(nodeSpy).not.toHaveBeenCalled()
            done()
        })
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
    it ('should only rebuild node bundle', (done) => {
        const unistack = new UniStack()
        const browserSpy = jasmine.createSpy('browserSpy')
        const nodeSpy = jasmine.createSpy('nodeSpy')
        // mock bundler
        unistack.cache.state = {
            environment: {
                bundles: {
                    browser: {
                        bundler: {
                            build: () => Promise.resolve(browserSpy('browser'))
                        }
                    },
                    node: {
                        bundler: {
                            build: () => Promise.resolve(nodeSpy('node'))
                        }
                    }
                }
            }
        }
        // mock emit event
        unistack.emitEvent = () => {}
        unistack.rebuildBundles({ node: true })
        .then(() => {
            expect(nodeSpy).toHaveBeenCalledTimes(1)
            expect(nodeSpy).toHaveBeenCalledWith('node')
            expect(browserSpy).not.toHaveBeenCalled()
            done()
        })
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
    it ('should only rebuild browser and node bundles', (done) => {
        const unistack = new UniStack()
        const browserSpy = jasmine.createSpy('browserSpy')
        const nodeSpy = jasmine.createSpy('nodeSpy')
        // mock bundler
        unistack.cache.state = {
            environment: {
                bundles: {
                    browser: {
                        bundler: {
                            build: () => Promise.resolve(browserSpy('browser'))
                        }
                    },
                    node: {
                        bundler: {
                            build: () => Promise.resolve(nodeSpy('node'))
                        }
                    }
                }
            }
        }
        // mock emit event
        unistack.emitEvent = () => {}
        unistack.rebuildBundles({ browser: true, node: true })
        .then(() => {
            expect(browserSpy).toHaveBeenCalledTimes(1)
            expect(browserSpy).toHaveBeenCalledWith('browser')
            expect(nodeSpy).toHaveBeenCalledTimes(1)
            expect(nodeSpy).toHaveBeenCalledWith('node')
            done()
        })
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
    it ('should emit a "reload" event if node rebundled do server file changes', (done) => {
        const unistack = new UniStack()
        const browserSpy = jasmine.createSpy('browserSpy')
        const nodeSpy = jasmine.createSpy('nodeSpy')
        // mock bundler
        unistack.cache.state = {
            environment: {
                bundles: {
                    browser: {
                        bundler: {
                            build: () => Promise.resolve(browserSpy('browser'))
                        }
                    },
                    node: {
                        bundler: {
                            build: () => Promise.resolve(nodeSpy('node'))
                        }
                    }
                }
            }
        }
        // mock emit event
        unistack.emitEvent = event => {
            expect(event).toBe('reload')
            done()
        }
        unistack.rebuildBundles({ browser: true, node: true, explicitNode: true })
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
})

describe ('UniStack rebuildBundles()', () => {
    let originalTimeout
    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
    })
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
    })
    it ('should only rebuild browser bundle', (done) => {
        const unistack = new UniStack()
        const browserSpy = jasmine.createSpy('browserSpy')
        const nodeSpy = jasmine.createSpy('nodeSpy')
        // mock bundler
        unistack.cache.state = {
            environment: {
                bundles: {
                    browser: {
                        bundler: {
                            build: () => Promise.resolve(browserSpy('browser'))
                        }
                    },
                    node: {
                        bundler: {
                            build: () => Promise.resolve(nodeSpy('node'))
                        }
                    }
                }
            }
        }
        unistack.rebuildBundles({ browser: true })
        .then(() => {
            expect(browserSpy).toHaveBeenCalledTimes(1)
            expect(browserSpy).toHaveBeenCalledWith('browser')
            expect(nodeSpy).not.toHaveBeenCalled()
            done()
        })
        .catch(e => console.log(e.stack)) // catch errors in previous blocks
    })
})

describe ('UniStack handleFileChange()', () => {
    let originalTimeout
    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
    })
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
    })
    it ('should trigger rebuild for node bundle only', (done) => {
        const unistack = new UniStack()
        unistack.emitEvent = () => {}
        unistack.rebuildBundles = config => {
            expect(config.node).toBe(true)
            expect(config.browser).toBe(false)
            expect(config.explicitNode).toBe(true)
            done()
        }
        const serverFile = Path.join(envPath, 'src', 'server', 'index.js')
        unistack.handleFileChange(serverFile)
    })
    it ('should trigger rebuild for browser bundle only', (done) => {
        const unistack = new UniStack()
        unistack.emitEvent = () => {}
        unistack.rebuildBundles = config => {
            expect(config.browser).toBe(true)
            expect(config.node).toBe(false)
            expect(config.explicitNode).toBe(false)
            done()
        }
        const serverFile = Path.join(envPath, 'src', 'client', 'index.js')
        unistack.handleFileChange(serverFile)
    })
    it ('should trigger rebuild for browser and node bundles', (done) => {
        const unistack = new UniStack()
        unistack.emitEvent = () => {}
        unistack.rebuildBundles = config => {
            expect(config.browser).toBe(true)
            expect(config.node).toBe(true)
            expect(config.explicitNode).toBe(false)
            done()
        }
        const serverFile = Path.join(envPath, 'src', 'shared', 'index.js')
        unistack.handleFileChange(serverFile)
    })
    it ('should throttle rebuild trigger for two seconds', (done) => {
        const unistack = new UniStack()
        let timer = 0
        const interval = setInterval(() => timer++, 100)
        unistack.emitEvent = () => {}
        unistack.rebuildBundles = config => {
            // test against 1.5 seconds with a 0.5 second buffer
            expect(timer).toBeGreaterThan(15)
            clearInterval(interval)
            done()
        }
        const serverFile = Path.join(envPath, 'src', 'shared', 'index.js')
        unistack.handleFileChange(serverFile)
    })
    it ('should merge multiple bundle requests within throttle', (done) => {
        const unistack = new UniStack()
        unistack.emitEvent = () => {}
        unistack.rebuildBundles = config => {
            expect(config.browser).toBe(true)
            expect(config.node).toBe(true)
            expect(config.explicitNode).toBe(true)
            done()
        }
        const clientFile = Path.join(envPath, 'src', 'client', 'index.js')
        const serverFile = Path.join(envPath, 'src', 'server', 'index.js')
        unistack.handleFileChange(clientFile)
        unistack.handleFileChange(serverFile)
        unistack.handleFileChange(clientFile) // ensure no overwrites
    })
    it ('should trigger "change" event when triggering non-node bundle', (done) => {
        const unistack = new UniStack()
        unistack.rebuildBundles = config => {
            expect(config.browser).toBe(true)
            expect(config.node).toBe(true)
            expect(config.explicitNode).toBe(false)
        }

        const clientFile = Path.join(envPath, 'src', 'client', 'index.js')
        unistack.emitEvent = (type, filename)  => {
            expect(type).toBe('change')
            expect(filename).toBe(clientFile)
        }
        unistack.handleFileChange(clientFile)

        const sharedFile = Path.join(envPath, 'src', 'shared', 'index.js')
        unistack.emitEvent = (type, filename)  => {
            expect(type).toBe('change')
            expect(filename).toBe(sharedFile)
            done()
        }
        unistack.handleFileChange(sharedFile)
    })
})

if (!process.env.QUICK_TEST_RUN) {
    describe ('UniStack JSPM install dependent tests', () => {
        describe ('UniStack installJSPMDependencies()', () => {
            console.log('--Testing installation of JSPM dependencies!')
            // ############################ ATTENTION ############################
                // This it block has to remain as the first spec on this block.
                // This is, in part, do to the programatic jspm.install(true)
                // being a one time deal per process, and also helps with
                // performance, as jspm.install(true) takes time and there
                // is no benefit in running jspm.install(true) multiple times.
            // ############################ ATTENTION ############################
            const unistack = new UniStack()
            let originalTimeout
            beforeEach(() => {
                originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
                jasmine.DEFAULT_TIMEOUT_INTERVAL = 240000
            })
            afterEach(() => {
                jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            })
            it ('should install jspm dependencies.', (done) => {
                const packagesPath = Path.join(envUnistackBootstrapPath, 'jspm_packages')
                unistack.setupPackageJSON()
                unistack.installJSPMDependencies()
                .then(() => {
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'npm')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'github')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system.js')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system.src.js')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system.js.map')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system-polyfills.js')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system-polyfills.src.js')))
                    .not.toThrowError()
                    expect(() => Fs.lstatSync(Path.join(packagesPath, 'system-polyfills.js.map')))
                    .not.toThrowError()
                    done()
                }).catch(e => { console.log(e.stack) }) // catch errors in previous block
            })
        })

        describe ('UniStack bundle()', () => {
            const unistack = new UniStack()
            const entryFile = Path.join(envUnistackBootstrapPath, 'server', 'index.js')
            const outputFile = Path.join(envUnistackBootstrapPath, 'server', 'bundle.js')

            it ('should return an bundler object with a build method', () => {
                expect(unistack.bundle(entryFile, outputFile).build)
                .toEqual(jasmine.any(Function))
            })
            it ('should accept build options', () => {
                const buildOptions = {
                    sfx: true,
                    minify: true,
                    mangle: true,
                    sourceMaps: true,
                    lowResSourceMaps: true
                }
                const bundler = unistack.bundle(entryFile, outputFile, buildOptions)
                expect(bundler.buildOptions).toEqual(buildOptions)
            })
        })

        describe ('UniStack initNodeBundle()', () => {
            let originalTimeout
            beforeEach(() => {
                originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
                jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
            })
            afterEach(() => {
                jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            })
            it ('should initialize node production bundle', (done) => {
                const unistack = new UniStack()
                const nodeBundle = Path.join(envPath, 'dist', 'server.bundle.js')
                const buildOptions = {
                    sfx: true,
                    node: true,
                    production: true,
                    sourceMaps: true
                }
                unistack.initNodeBundle(true).then(bundler => {
                    expect(bundler.build).toEqual(jasmine.any(Function))
                    expect(bundler.buildOptions)
                    .toEqual(jasmine.objectContaining(buildOptions))
                    const bundle = require(nodeBundle).default
                    expect(bundle.environment).toBe('production')
                    return bundle
                })
                .then(bundle => bundle.serve)
                .then(server => {
                    delete require.cache[nodeBundle]
                    Fs.removeSync(nodeBundle)
                    Fs.removeSync(nodeBundle + '.map')
                    ServerDestroy(server)
                    server.destroy(done)
                })
                .catch(e => console.error(e.stack))
            })
            it ('should initialize node development bundle', (done) => {
                const unistack = new UniStack()
                const nodeBundle = Path.join(envUnistackBootstrapPath, 'server', 'server.bundle.js')
                const buildOptions = {
                    sfx: true,
                    node: true,
                    production: false,
                    sourceMaps: true
                }
                unistack.initNodeBundle().then(bundler => {
                    expect(bundler.build).toEqual(jasmine.any(Function))
                    expect(bundler.buildOptions)
                    .toEqual(jasmine.objectContaining(buildOptions))
                    const bundle = require(nodeBundle).default
                    expect(bundle.environment).toBe('development')
                    return bundle
                })
                .then(bundle => bundle.serve)
                .then(server => {
                    delete require.cache[nodeBundle]
                    Fs.removeSync(nodeBundle)
                    Fs.removeSync(nodeBundle + '.map')
                    ServerDestroy(server)
                    server.destroy(done)
                })
                .catch(e => console.error(e.stack))
            })
        })

        describe ('UniStack initBrowserBundle()', () => {
            let originalTimeout
            beforeEach(() => {
                originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
                jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
            })
            afterEach(() => {
                jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            })
            it ('should initialize browser production bundle', (done) => {
                const unistack = new UniStack()
                const browserBundle = Path.join(envPath, 'dist', 'client.bundle.js')
                const buildOptions = {
                    sourceMaps: true
                }
                unistack.initBrowserBundle().then(bundler => {
                    expect(bundler.build).toEqual(jasmine.any(Function))
                    expect(bundler.buildOptions)
                    .toEqual(jasmine.objectContaining(buildOptions))
                    expect(() => Fs.lstatSync(browserBundle)).not.toThrowError()
                    Fs.removeSync(browserBundle)
                    Fs.removeSync(browserBundle + '.map')
                    done()
                })
                .catch(e => console.error(e.stack))
            })
        })

        describe ('UniStack watchFiles()', () => {
            let originalTimeout
            beforeEach(() => {
                originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
                jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000
            })
            afterEach(() => {
                jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            })
            it ('should return and fulfil a promise', (done) => {
                const unistack = new UniStack()
                unistack.watchFiles().then(gaze => {
                    gaze.close()
                    done()
                })
                .catch(e => console.error(e.stack))
            })
            it ('should return and fulfil a promise', (done) => {
                const unistack = new UniStack()
                const tmpFile = Path.join(envPath, 'file-watch-test.js')
                let globalGaze
                unistack.handleFileChange = filename => {
                    expect(tmpFile).toBe(filename)
                    Fs.removeSync(tmpFile)
                    globalGaze.close()
                    done()
                }
                Fs.writeFileSync(tmpFile, 'Hello')
                unistack.watchFiles().then(gaze => {
                    Fs.appendFileSync(tmpFile, 'World!')
                    globalGaze = gaze
                })
                .catch(e => console.error(e.stack))
            })
            it ('should store the watcher server in state object', (done) => {
                const unistack = new UniStack()
                const tmpFile = Path.join(envPath, 'file-watch-test.js')
                unistack.watchFiles().then(gaze => {
                    expect(unistack.cache.state.watcher.server).toBe(gaze)
                    gaze.close()
                    done()
                })
                .catch(e => console.error(e.stack))
            })
        })

        describe ('UniStack runNodeBundle()', () => {
            let originalTimeout
            beforeEach(() => {
                originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
                jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000
            })
            afterEach(() => {
                jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
            })
            it ('should require the node bundle', (done) => {
                const unistack = new UniStack()
                const nodeBundle = Path.join(envUnistackBootstrapPath, 'server', 'server.bundle.js')
                unistack.initNodeBundle()
                .then(unistack.runNodeBundle.bind(unistack))
                .then(server => {
                    Fs.removeSync(nodeBundle)
                    Fs.removeSync(nodeBundle + '.map')
                    server.destroy(done)
                })
                .catch(e => console.error(e.stack))
            })
        })
    }) // End of UniStack JSPM install dependent tests
}