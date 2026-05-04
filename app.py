import streamlit as st
import os
from agent import perguntar_ao_agente

# Configuração da página
st.set_page_config(
    page_title="MeteoBot Local - IA Meteorológica",
    page_icon="🌤️",
    layout="centered"
)

# Estilo CSS personalizado para um aspeto premium
st.markdown("""
    <style>
    .main {
        background-color: #f0f2f6;
    }
    .stChatFloatingInputContainer {
        bottom: 20px;
    }
    .stChatMessage {
        border-radius: 15px;
        padding: 10px;
        margin-bottom: 10px;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("🌤️ MeteoBot Local")
st.markdown("""
Bem-vindo ao teu assistente pessoal de meteorologia! 
Pergunta-me sobre o tempo em qualquer cidade do mundo.
""")

# Inicializar o histórico do chat
if "messages" not in st.session_state:
    st.session_state.messages = []

# Exibir mensagens do histórico
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Campo de entrada do utilizador
if prompt := st.chat_input("Ex: Como está o tempo em Ponte de Lima?"):
    # Adicionar mensagem do utilizador ao histórico
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Gerar resposta do agente
    with st.chat_message("assistant"):
        with st.spinner("A consultar os céus..."):
            # Passamos o histórico completo para o agente para manter o contexto
            resposta = perguntar_ao_agente(prompt, st.session_state.messages)
            st.markdown(resposta)
            
    # Adicionar resposta ao histórico
    st.session_state.messages.append({"role": "assistant", "content": resposta})
