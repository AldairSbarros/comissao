"""Migrações idempotentes para bancos SQLite já existentes.

O Base.metadata.create_all só cria tabelas que ainda não existem; ele NÃO
adiciona colunas novas em tabelas já criadas. Esta função compara as colunas
definidas nos modelos com as colunas reais no banco e aplica
ALTER TABLE ADD COLUMN para as que faltarem.

É idempotente: pode rodar a qualquer momento (na subida do backend e no seed)
sem efeito colateral — colunas que já existem são ignoradas.
"""
from sqlalchemy import inspect, text

from database import engine as default_engine
import models


def _column_default_literal(col):
    """Retorna o valor default literal da coluna, ou None se não houver.

    Defaults dinâmicos (chamáveis, ex.: datetime.date.today) não são literais
    e são ignorados aqui.
    """
    default = col.default
    if default is None:
        return None
    arg = getattr(default, "arg", None)
    if callable(arg):
        return None
    return arg


def apply_migrations(engine=None):
    """Adiciona colunas que existem nos modelos mas faltam no banco."""
    if engine is None:
        engine = default_engine
    if engine.dialect.name != "sqlite":
        # Por enquanto as migrações automáticas valem apenas para SQLite.
        return

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in models.Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            actual = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in actual:
                    continue
                type_sql = col.type.compile(dialect=engine.dialect)
                ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {type_sql}"

                default = _column_default_literal(col)
                if default is not None:
                    if isinstance(default, bool):
                        ddl += f" DEFAULT {1 if default else 0}"
                    elif isinstance(default, str):
                        ddl += f" DEFAULT '{default}'"
                    else:
                        ddl += f" DEFAULT {default!r}"
                elif not col.nullable:
                    # Coluna NOT NULL sem default literal não pode ser
                    # adicionada a uma tabela não vazia no SQLite.
                    raise RuntimeError(
                        f"Não é possível adicionar a coluna {table.name}.{col.name} "
                        "(NOT NULL sem default) a uma tabela já existente. "
                        "Ajuste o modelo para ter um default ou permitir NULL."
                    )

                conn.execute(text(ddl))
                print(f"Migração: adicionada coluna {table.name}.{col.name} ({type_sql}).")