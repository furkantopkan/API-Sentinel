import { describe, expect, it } from 'vitest';
import { bodySentAsTyped, isFormBody, multipartToForm } from './formBody';

const part = (name: string, value: string, extra = '') =>
  `--B\r\nContent-Disposition: form-data; name="${name}"${extra}\r\n\r\n${value}\r\n`;

describe('isFormBody', () => {
  it('is true only for an enabled urlencoded Content-Type header', () => {
    const header = (value: string, enabled = true) => [{ key: ' content-TYPE ', value, enabled }];
    expect(isFormBody(header('application/x-www-form-urlencoded; charset=UTF-8'))).toBe(true);
    expect(isFormBody(header('application/x-www-form-urlencoded', false))).toBe(false);
    expect(isFormBody(header('application/json'))).toBe(false);
    expect(isFormBody([])).toBe(false);
  });
});

describe('multipartToForm', () => {
  it('converts text fields, also with a quoted boundary and plain line breaks', () => {
    expect(
      multipartToForm(
        `${part('a', '1')}${part('b', 'x y')}--B--`,
        'multipart/form-data; boundary=B',
      ),
    ).toBe('a=1&b=x+y');
    const unix = '--B\nContent-Disposition: form-data; name="a"\n\n1\n--B--';
    expect(multipartToForm(unix, 'multipart/form-data; boundary="B"')).toBe('a=1');
  });

  it.each([
    ['a file upload', `${part('f', 'data', '; filename="a.png"')}--B--`],
    ['a body that was cut off', part('a', '1')],
    ['a part without a name', '--B\r\nContent-Type: text/plain\r\n\r\n1\r\n--B--'],
  ])('refuses %s', (_label, body) => {
    expect(multipartToForm(body, 'multipart/form-data; boundary=B')).toBeNull();
  });

  it('refuses a Content-Type without a boundary', () => {
    expect(multipartToForm(`${part('a', '1')}--B--`, 'multipart/form-data')).toBeNull();
  });
});

describe('bodySentAsTyped', () => {
  const header = (value: string, enabled = true) => [{ key: 'Content-Type', value, enabled }];
  it('gives the declared type of a body that is not JSON', () => {
    expect(bodySentAsTyped(header('text/plain;charset=UTF-8'))).toBe('text/plain;charset=UTF-8');
    expect(bodySentAsTyped(header('application/x-www-form-urlencoded'))).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('is null for JSON, for no Content-Type and for a disabled one', () => {
    expect(bodySentAsTyped(header('application/json; charset=utf-8'))).toBeNull();
    expect(bodySentAsTyped(header('application/vnd.api+json'))).toBeNull();
    expect(bodySentAsTyped([])).toBeNull();
    expect(bodySentAsTyped(header('text/plain', false))).toBeNull();
  });
});
