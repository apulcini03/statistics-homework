"""Regenerate independent fixtures using only the Python standard library.

Even df: exact finite-sum identity for the gamma upper tail, evaluated with
80-digit Decimal arithmetic. Odd df: CPython math.erfc plus the positive
half-integer recurrence. Above x=700, use the erfc asymptotic expansion with
an alternating remainder bounded by the first omitted term (<1e-55 relative).
These are NOT the application's gamma series/continued-fraction algorithm.

Sources: https://dlmf.nist.gov/8.4, https://dlmf.nist.gov/8.8,
https://dlmf.nist.gov/7.12, https://docs.python.org/3/library/math.html#math.erfc
CPython erfc/sqrt are binary64, so 80 working digits do not imply 80-digit
reference accuracy. Tests allow 2e-11 relative error (absolute 5e-14 for the
default example); subnormal comparisons additionally allow 2 minimum doubles.
"""
import json
import math
import platform
from decimal import Decimal, localcontext
from pathlib import Path

PI = Decimal('3.14159265358979323846264338327950288419716939937510582097494459230781640628620899')


def survival(statistic, df):
    x = statistic / 2
    if not x:
        return Decimal(1)
    if df % 2 == 0:
        term = total = Decimal(1)
        for k in range(1, df // 2):
            term *= x / k
            total += term
        return (-x).exp() * total
    if x <= 700:
        q = Decimal.from_float(math.erfc(math.sqrt(float(x))))
    else:
        term = total = Decimal(1)
        for k in range(1, 1000):
            following = -term * (2 * k - 1) / (2 * x)
            if abs(following) < Decimal('1e-55') * abs(total):
                break
            if abs(following) >= abs(term):
                raise ArithmeticError('Asymptotic remainder target not reached')
            total += following
            term = following
        else:
            raise ArithmeticError('Asymptotic expansion did not stop')
        q = (-x).exp() / (PI * x).sqrt() * total
    term = 2 * x.sqrt() * (-x).exp() / PI.sqrt()
    for k in range((df - 1) // 2):
        q += term
        term *= x / (Decimal(k) + Decimal('1.5'))
    return q


with localcontext() as context:
    context.prec = 80
    cases = [(Decimal(8) / 45, 1)]
    cases += [(Decimal(str(x)), df) for df, xs in [
        (1, [0, .01, 1, 5, 50, 100, 1000, 1400, 2000]),
        (2, [0, .1, 2, 10, 100, 1400, 1480, 1500, 2500]),
        (3, [.1, 3, 10, 100, 2000]), (4, [1, 4, 20, 100]),
        (10, [1, 10, 50, 100]), (100, [50, 100, 200, 1000]),
        (2400, [2000, 2400, 2600, 5000]), (2401, [2000, 2401, 2600, 5000])
    ] for x in xs]
    vectors = []
    for statistic, df in cases:
        p = survival(statistic, df)
        vectors.append({'statistic': float(statistic), 'df': df,
                        'probability': str(p), 'logProbability': float(p.ln())})
    output = {
        'provenance': 'CPython math.erfc and independent integer/half-integer finite recurrences; 80-digit Decimal working precision',
        'pythonVersion': platform.python_version(),
        'precisionNote': 'Binary64 erfc/sqrt in odd-df base values; not 80-digit guaranteed accuracy. See generator and test tolerances.',
        'sources': ['https://dlmf.nist.gov/8.4', 'https://dlmf.nist.gov/8.8',
                    'https://dlmf.nist.gov/7.12', 'https://docs.python.org/3/library/math.html#math.erfc'],
        'vectors': vectors
    }
    Path(__file__).with_name('chi-square-reference-vectors.json').write_text(json.dumps(output, indent=2) + '\n')
