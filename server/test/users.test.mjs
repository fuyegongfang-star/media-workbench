// 用户注册与管理（T6.4）回归测试：DTO 白名单、角色守卫、用户管理护栏。
// 运行：node --test server/test/users.test.mjs（需先 npm run build）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cv from 'class-validator';
import ct from 'class-transformer';
import nestCommon from '@nestjs/common';

const { validate } = cv;
const { plainToInstance } = ct;
const { ValidationPipe, ForbiddenException, BadRequestException, ConflictException } = nestCommon;

const registerDto = (await import('../dist/modules/auth/dto/register.dto.js')).default;
const changePwdDto = (await import('../dist/modules/auth/dto/change-password.dto.js')).default;
const userDto = (await import('../dist/modules/users/dto/user.dto.js')).default;
const { UsersService } = await import('../dist/modules/users/users.service.js');
const { RolesGuard, ROLES_KEY, Roles } = await import('../dist/modules/auth/guards/roles.guard.js');

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

// ---------- DTO 白名单 ----------

test('RegisterDto: 合法注册体通过，含 role 字段被白名单拒绝（防提权）', async () => {
  const ok = { username: 'alice_01', password: 'strongpass123' };
  assert.equal((await validate(plainToInstance(registerDto.RegisterDto, ok))).length, 0);
  const bad = { ...ok, role: 'owner' };
  await assert.rejects(
    () => pipe.transform(bad, { type: 'body', metatype: registerDto.RegisterDto }),
    '带 role 的注册体应被 forbidNonWhitelisted 拒绝',
  );
});

test('RegisterDto: 弱口令/非法用户名被拒', async () => {
  assert.ok((await validate(plainToInstance(registerDto.RegisterDto, { username: 'ab', password: '123' }))).length > 0);
  assert.ok((await validate(plainToInstance(registerDto.RegisterDto, { username: 'bad name!', password: 'strongpass' }))).length > 0);
});

test('ChangePasswordDto: 新口令至少 8 位', async () => {
  assert.equal((await validate(plainToInstance(changePwdDto.ChangePasswordDto, { oldPassword: 'oldsomething', newPassword: 'newpass123' }))).length, 0);
  assert.ok((await validate(plainToInstance(changePwdDto.ChangePasswordDto, { oldPassword: 'x', newPassword: 'short' }))).length > 0);
});

test('User DTO: 建号/改角色/状态/重置口令的枚举与长度校验', async () => {
  assert.equal((await validate(plainToInstance(userDto.CreateUserDto, { username: 'bob', password: 'pass12345', role: 'editor' }))).length, 0);
  assert.equal((await validate(plainToInstance(userDto.CreateUserDto, { username: 'bob', password: 'pass12345' }))).length, 0, 'role 可选');
  assert.ok((await validate(plainToInstance(userDto.CreateUserDto, { username: 'bob', password: 'pass12345', role: 'superuser' }))).length > 0);
  assert.ok((await validate(plainToInstance(userDto.UpdateUserRoleDto, { role: 'hacker' }))).length > 0);
  assert.ok((await validate(plainToInstance(userDto.UpdateUserStatusDto, { status: 'frozen' }))).length > 0);
  assert.equal((await validate(plainToInstance(userDto.UpdateUserStatusDto, { status: 'disabled' }))).length, 0);
});

// ---------- 角色守卫 ----------

test('RolesGuard: 未标注 @Roles 放行；角色命中放行；角色不符/无用户拒绝', () => {
  const reflector = {
    getAllAndOverride: () => undefined,
  };
  const guard = new RolesGuard(reflector);
  const ctxNoMeta = { switchToHttp: () => ({ getRequest: () => ({}) }), getHandler: () => {}, getClass: () => {} };
  assert.equal(guard.canActivate(ctxNoMeta), true, '无 @Roles 元数据应放行');

  const reflectorWithRoles = { getAllAndOverride: () => ['owner', 'admin'] };
  const guard2 = new RolesGuard(reflectorWithRoles);
  const mkCtx = (user) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }), getHandler: () => {}, getClass: () => {} });
  assert.equal(guard2.canActivate(mkCtx({ role: 'admin' })), true);
  assert.equal(guard2.canActivate(mkCtx({ role: 'owner' })), true);
  assert.throws(() => guard2.canActivate(mkCtx({ role: 'editor' })), (e) => e instanceof ForbiddenException, 'editor 应被拒');
  assert.throws(() => guard2.canActivate(mkCtx(undefined)), (e) => e instanceof nestCommon.UnauthorizedException, '无用户应 401');
});

test('Roles 装饰器写入正确元数据键', () => {
  const fn = () => {};
  Roles('owner', 'admin')(fn, '', { value: fn });
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, fn), ['owner', 'admin']);
});

// ---------- UsersService 护栏（mock Prisma）----------

function makeService(overrides = {}) {
  const state = {
    users: [
      { id: 'u-owner', username: 'admin', role: 'owner', status: 'active', lastLoginAt: null, createdAt: new Date('2026-01-01') },
      { id: 'u-editor', username: 'editor1', role: 'editor', status: 'active', lastLoginAt: null, createdAt: new Date('2026-01-02') },
    ],
    ...overrides,
  };
  const client = {
    user: {
      findMany: async () => [...state.users],
      findUnique: async ({ where }) => state.users.find((u) => (u.id && where.id === u.id) || (u.username && where.username === u.username)) ?? null,
      count: async ({ where }) => state.users.filter((u) => (!where.role || u.role === where.role) && (!where.status || u.status === where.status)).length,
      create: async ({ data }) => {
        const row = { id: 'u-new', lastLoginAt: null, createdAt: new Date(), ...data };
        state.users.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.users.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }) => {
        const idx = state.users.findIndex((u) => u.id === where.id);
        const [row] = state.users.splice(idx, 1);
        return row;
      },
    },
  };
  return { svc: new UsersService({ client }), state };
}

test('UsersService.list 不含 passwordHash', async () => {
  const { svc } = makeService();
  const list = await svc.list();
  assert.equal(list.length, 2);
  for (const u of list) assert.equal('passwordHash' in u, false);
});

test('UsersService.create 生成 editor 角色、用户名冲突抛 409', async () => {
  const { svc } = makeService();
  const created = await svc.create({ username: 'newbie', password: 'pass12345' });
  assert.equal(created.role, 'editor');
  await assert.rejects(() => svc.create({ username: 'admin', password: 'pass12345' }), (e) => e instanceof ConflictException);
});

test('UsersService.updateRole 不能改自己、不能降级最后一个 owner', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.updateRole('u-owner', { role: 'admin' }, 'u-owner'), (e) => e instanceof BadRequestException);
  await assert.rejects(() => svc.updateRole('u-owner', { role: 'editor' }, 'u-editor'), (e) => e instanceof BadRequestException);
  const ok = await svc.updateRole('u-editor', { role: 'admin' }, 'u-owner');
  assert.equal(ok.role, 'admin');
});

test('UsersService.updateStatus 不能禁用自己、不能禁用最后一个 owner', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.updateStatus('u-owner', { status: 'disabled' }, 'u-owner'), (e) => e instanceof BadRequestException);
  await assert.rejects(() => svc.updateStatus('u-owner', { status: 'disabled' }, 'u-editor'), (e) => e instanceof BadRequestException);
  const ok = await svc.updateStatus('u-editor', { status: 'disabled' }, 'u-owner');
  assert.equal(ok.status, 'disabled');
});

test('UsersService.remove 不能删自己、不能删最后一个 owner，可删普通用户', async () => {
  const { svc } = makeService();
  await assert.rejects(() => svc.remove('u-owner', 'u-owner'), (e) => e instanceof BadRequestException);
  await assert.rejects(() => svc.remove('u-owner', 'u-editor'), (e) => e instanceof BadRequestException);
  const ok = await svc.remove('u-editor', 'u-owner');
  assert.deepEqual(ok, { ok: true });
});

test('UsersService.resetPassword 调用 argon2 哈希并更新，不存在用户抛 404', async () => {
  const { svc } = makeService();
  const ok = await svc.resetPassword('u-editor', { password: 'brandnew123' });
  assert.deepEqual(ok, { ok: true });
  await assert.rejects(() => svc.resetPassword('u-missing', { password: 'brandnew123' }), (e) => e instanceof nestCommon.NotFoundException);
});
