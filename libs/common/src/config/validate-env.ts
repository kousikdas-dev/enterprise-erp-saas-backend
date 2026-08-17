import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

export function validateEnv<T extends object>(
  cls: ClassConstructor<T>,
  config: Record<string, unknown>,
): T {
  const validated = plainToInstance(cls, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${formatErrors(errors)}`);
  }

  return validated;
}

function formatErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints).join(', ')
        : 'invalid';
      return `${error.property}: ${constraints}`;
    })
    .join('; ');
}
