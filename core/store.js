import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk';
import reducers from './reducers/index'

export function createSharedStore( initialState, devTools ) {
    return applyMiddleware( thunk )( createStore )(
        reducers,
        initialState,
        devTools
    )
}

export default createSharedStore
