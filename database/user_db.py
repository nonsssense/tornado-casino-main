from db_config import engine, users_table
import sqlalchemy as sa

# datamase module for info about a users

# Работа с базой данных для получения информации о пользователях


# client_seed, hash_server_seed, nonce, 
def getUserData(user_id):

    with engine.begin() as conn:
        get_stmt = sa.select(users_table).where(users_table.c.id==user_id)
        result = conn.execute(get_stmt)

        response = {'hash_server_seed': result.hash_server_seed,
                    'client_seed': result.client_seed,
                    'nonce': result.nonce}
        
        updateUserNonce(user_id)
        return response

        

def updateUserNonce(user_id):
    with engine.begin() as conn:
        update_stmt = sa.update(users_table.c.nonce).where(users_table.c.id==user_id).values(nonce=+1)
        conn.execute(update_stmt)
        