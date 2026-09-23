import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import crud
import main
import models
import schemas
import security
import seed
from database import Base, get_db


@pytest.fixture
def bootstrap_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(seed, "engine", engine)
    monkeypatch.setattr(seed, "SessionLocal", sessions)
    with sessions() as db:
        yield db
    engine.dispose()


@pytest.fixture
def bootstrap_client(bootstrap_db):
    def override_db():
        yield bootstrap_db

    previous = main.app.dependency_overrides.copy()
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(main.app) as client:
            yield client
    finally:
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(previous)


@pytest.fixture
def payload():
    return {
        "superuser_email": "owner@example.com",
        "superuser_password": "owner-password-123",
    }


def superuser_headers(bootstrap_db, email):
    token = security.create_access_token({"sub": email})
    return {"Authorization": f"Bearer {token}"}


def test_setup_creates_only_superuser_and_allows_master_login(bootstrap_client, bootstrap_db, payload):
    assert bootstrap_client.get("/setup/status").json() == {"setup_complete": False}
    response = bootstrap_client.post("/setup/initialize", json=payload)
    assert response.status_code == 201
    assert response.json()["is_superuser"] is True
    assert "hashed_password" not in response.json()
    assert bootstrap_client.get("/setup/status").json() == {"setup_complete": True}
    assert bootstrap_db.query(models.Usuario).count() == 1
    assert bootstrap_db.query(models.Denominacao).count() == 0
    owner = crud.get_user_by_email(bootstrap_db, payload["superuser_email"])
    assert owner.denominacao_id is None

    login = bootstrap_client.post("/token", data={
        "username": payload["superuser_email"], "password": payload["superuser_password"],
    })
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert bootstrap_client.get("/master/tenants", headers=headers).status_code == 200
    assert bootstrap_client.post("/setup/initialize", json=payload).status_code == 400
    assert bootstrap_db.query(models.Usuario).count() == 1


@pytest.mark.parametrize("conflict", ["existing_email"])
def test_setup_conflicts_do_not_create_partial_data(bootstrap_client, bootstrap_db, payload, conflict):
    if conflict == "existing_email":
        crud.create_user(bootstrap_db, schemas.UsuarioCreate(
            email=payload["superuser_email"], password="existing-password", funcao="tesoureiro",
        ))
    counts = (bootstrap_db.query(models.Usuario).count(), bootstrap_db.query(models.Denominacao).count())
    assert bootstrap_client.post("/setup/initialize", json=payload).status_code == 400
    assert counts == (bootstrap_db.query(models.Usuario).count(), bootstrap_db.query(models.Denominacao).count())
    assert bootstrap_client.get("/setup/status").json() == {"setup_complete": False}


def test_setup_rolls_back_on_commit_failure(bootstrap_db, payload, monkeypatch):
    def failing_commit():
        raise RuntimeError("Simulated commit failure")

    monkeypatch.setattr(bootstrap_db, "commit", failing_commit)
    with pytest.raises(RuntimeError):
        crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    bootstrap_db.rollback()
    assert bootstrap_db.query(models.Usuario).count() == 0
    assert bootstrap_db.query(models.Denominacao).count() == 0


def test_database_rejects_second_superuser(bootstrap_db, payload):
    crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    with pytest.raises(IntegrityError):
        crud.create_user(bootstrap_db, schemas.UsuarioCreate(
            email="other-owner@example.com", password="other-password", funcao="superuser", is_superuser=True,
        ))
    bootstrap_db.rollback()
    assert bootstrap_db.query(models.Usuario).filter_by(is_superuser=True).count() == 1


def test_index_is_added_to_existing_database(bootstrap_db, payload):
    engine = bootstrap_db.get_bind()
    models.single_superuser_index.drop(engine)
    # create_all alone skips indexes when the table already exists.
    Base.metadata.create_all(engine)
    models.single_superuser_index.create(engine, checkfirst=True)
    test_database_rejects_second_superuser(bootstrap_db, payload)


@pytest.mark.parametrize("role, flag", [("superuser", True), ("superuser", False), ("administrador", False)])
def test_anonymous_registration_is_rejected(bootstrap_client, bootstrap_db, role, flag):
    response = bootstrap_client.post("/usuarios/", json={
        "email": "attacker@example.com", "password": "attacker-password", "funcao": role, "is_superuser": flag,
    })
    assert response.status_code == 401
    assert bootstrap_db.query(models.Usuario).count() == 0


def test_only_superuser_can_create_regular_users(bootstrap_client, bootstrap_db, payload):
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    user = {"email": "new@example.com", "password": "new-user-password", "funcao": "tesoureiro"}
    admin = crud.create_user(bootstrap_db, schemas.UsuarioCreate(
        email="admin@example.com", password="admin-password-456", funcao="administrador",
    ))
    admin_token = security.create_access_token({"sub": admin.email})
    assert bootstrap_client.post("/usuarios/", json=user, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 403
    owner_token = security.create_access_token({"sub": owner.email})
    headers = {"Authorization": f"Bearer {owner_token}"}
    assert bootstrap_client.post("/usuarios/", json={**user, "is_superuser": True}, headers=headers).status_code == 403
    assert bootstrap_client.post("/usuarios/", json={**user, "funcao": "superuser"}, headers=headers).status_code == 403
    response = bootstrap_client.post("/usuarios/", json=user, headers=headers)
    assert response.status_code == 200
    assert response.json()["is_superuser"] is False


def test_superuser_can_create_multiple_tenants(bootstrap_client, bootstrap_db, payload):
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    headers = superuser_headers(bootstrap_db, owner.email)
    for i, nome in enumerate(["Igreja Alfa", "Igreja Beta"]):
        response = bootstrap_client.post("/master/tenants", json={
            "nome_denominacao": nome,
            "admin_email": f"admin{i}@example.com",
            "admin_password": "admin-password-456",
        }, headers=headers)
        assert response.status_code == 201
        assert response.json()["nome"] == nome
    assert bootstrap_db.query(models.Denominacao).count() == 2
    assert bootstrap_db.query(models.Usuario).count() == 3
    admin = crud.get_user_by_email(bootstrap_db, "admin0@example.com")
    assert admin.funcao == "administrador"
    assert not admin.is_superuser
    assert admin.denominacao_id is not None
    assert admin.denominacao.nome == "Igreja Alfa"
    assert bootstrap_client.get("/master/tenants", headers=headers).json()[0]["nome"] in {"Igreja Alfa", "Igreja Beta"}


def test_tenant_creation_requires_superuser(bootstrap_client, bootstrap_db, payload):
    crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    admin = crud.create_user(bootstrap_db, schemas.UsuarioCreate(
        email="admin@example.com", password="admin-password-456", funcao="administrador",
    ))
    body = {
        "nome_denominacao": "Igreja X",
        "admin_email": "adminx@example.com",
        "admin_password": "admin-password-456",
    }
    assert bootstrap_client.post("/master/tenants", json=body).status_code == 401
    headers = {"Authorization": f"Bearer {security.create_access_token({'sub': admin.email})}"}
    assert bootstrap_client.post("/master/tenants", json=body, headers=headers).status_code == 403
    assert bootstrap_db.query(models.Denominacao).count() == 0


@pytest.mark.parametrize("conflict", ["existing_name", "existing_email"])
def test_tenant_conflicts_do_not_create_partial_data(bootstrap_client, bootstrap_db, payload, conflict):
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    headers = superuser_headers(bootstrap_db, owner.email)
    if conflict == "existing_name":
        crud.create_denominacao(bootstrap_db, schemas.DenominacaoCreate(nome="Igreja X"))
    else:
        crud.create_user(bootstrap_db, schemas.UsuarioCreate(
            email="adminx@example.com", password="existing-password", funcao="tesoureiro",
        ))
    counts = (bootstrap_db.query(models.Usuario).count(), bootstrap_db.query(models.Denominacao).count())
    response = bootstrap_client.post("/master/tenants", json={
        "nome_denominacao": "Igreja X",
        "admin_email": "adminx@example.com",
        "admin_password": "admin-password-456",
    }, headers=headers)
    assert response.status_code == 400
    assert counts == (bootstrap_db.query(models.Usuario).count(), bootstrap_db.query(models.Denominacao).count())


def test_tenant_creation_rolls_back_failure_after_denominacao_insert(bootstrap_db, payload, monkeypatch):
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    original = security.get_password_hash

    def fail_on_admin(password):
        if password == "admin-password-456":
            raise RuntimeError("Simulated hashing failure")
        return original(password)

    monkeypatch.setattr(security, "get_password_hash", fail_on_admin)
    with pytest.raises(RuntimeError):
        crud.create_tenant(bootstrap_db, schemas.TenantCreate(
            nome_denominacao="Igreja Falha",
            admin_email="adminf@example.com",
            admin_password="admin-password-456",
        ))
    assert bootstrap_db.query(models.Denominacao).count() == 0
    assert bootstrap_db.query(models.Usuario).count() == 1


def test_seed_creates_only_superuser_and_is_idempotent(bootstrap_db, payload, monkeypatch, capsys):
    answers = iter([payload["superuser_email"]] * 2)
    passwords = iter([payload["superuser_password"]] * 4)
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(seed, "getpass", lambda _: next(passwords))
    seed.seed_initial_superuser()
    owner = crud.get_user_by_email(bootstrap_db, payload["superuser_email"])
    assert owner.is_superuser
    assert security.verify_password(payload["superuser_password"], owner.hashed_password)
    assert owner.denominacao_id is None
    assert bootstrap_db.query(models.Usuario).count() == 1
    assert bootstrap_db.query(models.Denominacao).count() == 0
    old_hash = owner.hashed_password
    seed.seed_initial_superuser()
    bootstrap_db.refresh(owner)
    assert owner.hashed_password == old_hash
    assert bootstrap_db.query(models.Usuario).count() == 1
    output = capsys.readouterr().out
    assert payload["superuser_password"] not in output


def test_seed_recovers_legacy_superuser_without_changing_tenants(bootstrap_db, monkeypatch):
    tenant = crud.create_denominacao(bootstrap_db, schemas.DenominacaoCreate(nome="Existing tenant"))
    user = crud.create_user(bootstrap_db, schemas.UsuarioCreate(
        email="legacy@example.com", password="old-password", funcao="superuser",
    ))
    monkeypatch.setattr("builtins.input", lambda _: user.email)
    monkeypatch.setattr(seed, "getpass", lambda _: "new-secure-password")
    seed.seed_initial_superuser(recover=True)
    bootstrap_db.refresh(user)
    assert user.is_superuser
    assert security.verify_password("new-secure-password", user.hashed_password)
    assert not security.verify_password("old-password", user.hashed_password)
    assert bootstrap_db.query(models.Usuario).count() == 1
    assert bootstrap_db.query(models.Denominacao).one().id == tenant.id


def test_seed_recovers_normal_superuser_password(bootstrap_db, monkeypatch):
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(
        superuser_email="owner@example.com", superuser_password="old-password",
    ))
    assert owner.is_superuser is True
    monkeypatch.setattr("builtins.input", lambda _: owner.email)
    monkeypatch.setattr(seed, "getpass", lambda _: "new-secure-password")
    seed.seed_initial_superuser(recover=True)
    bootstrap_db.refresh(owner)
    assert owner.is_superuser
    assert security.verify_password("new-secure-password", owner.hashed_password)
    assert not security.verify_password("old-password", owner.hashed_password)
    assert bootstrap_db.query(models.Usuario).count() == 1


def test_seed_does_not_promote_regular_user(bootstrap_db, monkeypatch):
    user = crud.create_user(bootstrap_db, schemas.UsuarioCreate(
        email="regular@example.com", password="regular-password", funcao="administrador",
    ))
    monkeypatch.setattr("builtins.input", lambda _: user.email)
    with pytest.raises(ValueError, match="Recuperacao permitida"):
        seed.seed_initial_superuser(recover=True)
    bootstrap_db.refresh(user)
    assert not user.is_superuser


def test_seed_rejects_duplicate_email_without_promoting(bootstrap_db, monkeypatch):
    user = crud.create_user(bootstrap_db, schemas.UsuarioCreate(
        email="legacy@example.com", password="legacy-password", funcao="superuser",
    ))
    monkeypatch.setattr("builtins.input", lambda _: user.email)
    with pytest.raises(ValueError, match="--recover"):
        seed.seed_initial_superuser()
    bootstrap_db.refresh(user)
    assert not user.is_superuser


@pytest.mark.parametrize("passwords", [["", ""], ["valid-password", "different-password"]])
def test_seed_rejects_bad_password_before_writing(bootstrap_db, monkeypatch, passwords):
    answers = iter(["owner@example.com"])
    password_iter = iter(passwords)
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    monkeypatch.setattr(seed, "getpass", lambda _: next(password_iter))
    with pytest.raises(ValueError):
        seed.seed_initial_superuser()
    assert bootstrap_db.query(models.Usuario).count() == 0


def test_http_setup_rejects_empty_password(bootstrap_client, bootstrap_db, payload):
    payload["superuser_password"] = ""
    assert bootstrap_client.post("/setup/initialize", json=payload).status_code == 422
    assert bootstrap_db.query(models.Usuario).count() == 0


def test_http_tenant_accepts_short_admin_password(bootstrap_client, bootstrap_db, payload):
    # O requisito de 12 caracteres foi removido: senha curta (não vazia) é aceita.
    owner = crud.initialize_setup(bootstrap_db, schemas.SetupPayload(**payload))
    headers = superuser_headers(bootstrap_db, owner.email)
    response = bootstrap_client.post("/master/tenants", json={
        "nome_denominacao": "Igreja X",
        "admin_email": "adminx@example.com",
        "admin_password": "short",
    }, headers=headers)
    assert response.status_code == 201
    assert bootstrap_db.query(models.Denominacao).count() == 1