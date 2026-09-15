from sqlalchemy.orm import Session
from database import SessionLocal
import crud
import schemas
import models

def seed_initial_superuser():
    """
    Cria o primeiro usuário Superuser do sistema se nenhum existir.
    Este usuário é o dono da plataforma.
    """
    db: Session = SessionLocal()
    try:
        # Verifica se já existe algum superuser no banco de dados
        existing_superuser = db.query(models.Usuario).filter(models.Usuario.is_superuser == True).first()
        if existing_superuser:
            print("Superusuário já existe. Nenhuma ação necessária.")
            return

        # --- Definições do Superusuário ---
        # IMPORTANTE: Altere o e-mail e a senha para seus próprios dados seguros.
        superuser_email = "aldairbarros@outlook.com" # <-- TROQUE PARA O SEU E-MAIL
        superuser_password = "P@stor2026" # <-- TROQUE PARA UMA SENHA FORTE

        superuser_schema = schemas.UsuarioCreate(
            email=superuser_email,
            password=superuser_password,
            funcao="superuser",  # Define uma função clara para identificação
            is_superuser=True
            # O `denominacao_id` não é informado, pois é opcional no schema
        )
        
        # Chama a função CRUD existente para criar o usuário
        crud.create_user(db, user=superuser_schema)
        
        print("✅ Usuário Superuser criado com sucesso!")
        print(f"   E-mail: {superuser_email}")
        print(f"   Senha: {superuser_password} (LEMBRE-SE DE ALTERAR ESTA SENHA EM PRODUÇÃO!)")

    finally:
        db.close()

if __name__ == "__main__":
    print("Iniciando o processo de seeding do banco de dados para criar o superusuário...")
    seed_initial_superuser()