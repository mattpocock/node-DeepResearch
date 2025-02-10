import { GlobalAsyncContext } from 'civkit/async-context';
import { container, singleton } from 'tsyringe';

@singleton()
export class AsyncLocalContext extends GlobalAsyncContext {}

const instance = container.resolve(AsyncLocalContext);
export default instance;
