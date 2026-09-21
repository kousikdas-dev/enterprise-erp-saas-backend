import { ArgumentsHost, ConflictException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const request = { method: 'POST', url: '/v1/example' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('omits code/details for an exception that never sets them', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();

    filter.catch(new NotFoundException('Shipment not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Shipment not found');
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('details');
  });

  it('forwards code/details when an exception opts in via its response payload', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = buildHost();

    filter.catch(
      new ConflictException({
        code: 'OPENING_BLOCKED_EXISTING_STOCK',
        message: 'Existing stock present',
        details: [{ productId: 'p1', warehouseId: 'w1', existingQuantity: '5.000000' }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe('OPENING_BLOCKED_EXISTING_STOCK');
    expect(body.message).toBe('Existing stock present');
    expect(body.details).toEqual([
      { productId: 'p1', warehouseId: 'w1', existingQuantity: '5.000000' },
    ]);
  });

  it('ignores a non-string code field rather than forwarding a malformed value', () => {
    const filter = new AllExceptionsFilter();
    const { host, json } = buildHost();

    filter.catch(
      new ConflictException({ code: 123, message: 'bad code type' }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body).not.toHaveProperty('code');
  });
});
