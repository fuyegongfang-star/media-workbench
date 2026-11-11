import {
  registerDecorator,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationOptions,
} from 'class-validator';
import { isPrismaJsonValue } from '../account.util';

/** 校验字段为合法 Prisma Json 值（对象/数组/字符串/数字/布尔/null）。 */
@ValidatorConstraint({ name: 'isPrismaJson', async: false })
export class IsPrismaJsonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isPrismaJsonValue(value);
  }
  defaultMessage(): string {
    return '必须是合法的 JSON 值（对象/数组/字符串/数字/布尔/null）';
  }
}

export function IsPrismaJson(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsPrismaJsonConstraint,
    });
  };
}
