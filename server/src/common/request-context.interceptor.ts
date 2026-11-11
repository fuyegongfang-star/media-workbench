import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { requestContext } from './request-context';

/**
 * 请求上下文拦截器（T1.3 / 深入设计 §2.4）。
 *
 * 守卫先于拦截器执行，req.user 已由 AccessTokenGuard 挂载为 AuthTokenPayload（sub=userId）。
 * 这里把 userId 注入 AsyncLocalStorage，供 Prisma 审计中间件读取。
 *
 * 注意：必须让 handler（及其内的异步 DB 查询）在 requestContext.run 的作用域内执行。
 * next.handle() 返回的 Observable 在订阅时才真正触发 controller，因此显式在 run 作用域内
 * 完成订阅，使异步查询通过 ALS 继承 userId。
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = _context
      .switchToHttp()
      .getRequest<{ user?: { sub?: string } }>();
    const userId = request?.user?.sub ?? null;

    return new Observable((subscriber: Subscriber<unknown>) => {
      requestContext.run({ userId }, () => {
        const sub = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        return () => sub.unsubscribe();
      });
    });
  }
}
