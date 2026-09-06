"""Normalizacija hrvatskog teksta.

Izdvojeno iz `oou.domovina.ai/src/normalize.py` — ovdje treba samo skidanje
dijakritike, pa se ne prenosi cijeli modul sa školskim kraticama.
"""
from __future__ import annotations

import unicodedata

# Đ/đ se ne dekomponiraju pod NFKD (samostalna slova), mapiramo eksplicitno.
_CROATIAN_MAP = str.maketrans({"đ": "d", "Đ": "D"})


def strip_diacritics(s: str) -> str:
    s = s.translate(_CROATIAN_MAP)
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))
