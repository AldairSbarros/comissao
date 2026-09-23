import argparse
from getpass import getpass

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from database import SessionLocal, engine
import crud
import models
import schemas
import security


def read_password(label):
    password = getpass(label)
    if not password:
        raise ValueError("A senha nao pode estar vazia.")
    if password != getpass("Confirme a senha: "):
        raise ValueError("As senhas nao coincidem.")
    return password


def seed_initial_superuser(*, recover=False):
    """Cria apenas o superusuario da plataforma (dono do sistema, sem tenant).

    As denominacoes (tenants) e seus administradores sao criados depois, pelo
    superusuario, via POST /master/tenants (ou painel master).
    """
    models.Base.metadata.create_all(bind=engine)
    models.single_superuser_index.create(bind=engine, checkfirst=True)
    print(f"Banco utilizado: {engine.url}")
    with SessionLocal() as db:
        if recover:
            email = schemas.UsuarioBase(email=input("Email do superusuario: ").strip()).email
            user = crud.get_user_by_email(db, email)
            if not user or user.funcao != "superuser" or any(
                value is not None for value in (user.denominacao_id, user.area_id, user.congregacao_id)
            ):
                raise ValueError("Recuperacao permitida apenas para a conta superuser antiga, sem vinculo com tenant.")
            password = read_password("Nova senha do superusuario: ")
            user.hashed_password = security.get_password_hash(password)
            user.is_superuser = True
            db.commit()
            print("Superusuario recuperado. Demais usuarios e dados foram preservados.")
            return

        existing = db.query(models.Usuario).filter(models.Usuario.is_superuser.is_(True)).first()
        if existing:
            print("Superusuario ja existe. Nenhum dado ou senha foi alterado.")
            return

        email = schemas.UsuarioBase(email=input("Email do superusuario: ").strip()).email
        if crud.get_user_by_email(db, email):
            raise ValueError("Email ja cadastrado. Para uma conta superuser afetada pelo erro antigo, use --recover.")
        crud.initialize_setup(db, schemas.SetupPayload(
            superuser_email=email,
            superuser_password=read_password("Senha do superusuario: "),
        ))
        print("Superusuario criado. Crie as denominacoes em /master/tenants (ou no painel master).")


def main():
    parser = argparse.ArgumentParser(description="Inicializa o superusuario da plataforma sem credenciais fixas.")
    parser.add_argument("--recover", action="store_true", help="Recupera uma conta superuser criada pelo erro antigo.")
    args = parser.parse_args()
    try:
        seed_initial_superuser(recover=args.recover)
    except ValidationError:
        print("Dados invalidos. Verifique o email e a senha.")
        return 1
    except IntegrityError:
        print("Conflito de unicidade no banco. Verifique se ja existe superusuario ou email cadastrado.")
        return 1
    except ValueError as exc:
        print(str(exc))
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nOperacao cancelada.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())