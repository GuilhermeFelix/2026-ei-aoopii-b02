import requests
import json
from datetime import datetime, timedelta
from langchain_community.llms.ollama import Ollama

# Códigos WMO para descrições em Português
WMO_CODES = {
    0: "Céu limpo", 1: "Céu quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Nevoeiro", 48: "Nevoeiro gelado",
    51: "Chuviscos fracos", 53: "Chuviscos", 55: "Chuviscos fortes",
    61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte",
    71: "Neve fraca", 73: "Neve moderada", 75: "Neve forte",
    80: "Aguaceiros fracos", 81: "Aguaceiros moderados", 82: "Aguaceiros fortes",
    95: "Trovoada", 96: "Trovoada com granizo fraco", 99: "Trovoada com granizo forte"
}

def geocode(city_name):
    """Converte nome de cidade para coordenadas via Open-Meteo Geocoding API."""
    try:
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={city_name}&count=1&language=pt"
        r = requests.get(url, timeout=5)
        data = r.json()
        if "results" in data and data["results"]:
            res = data["results"][0]
            return {"lat": res["latitude"], "lon": res["longitude"], "name": res["name"], "country": res.get("country", "")}
    except Exception as e:
        print(f"[GEOCODE ERROR] {e}")
    return None

def fetch_weather(lat, lon):
    """Busca dados meteorológicos completos: 7 dias passados + 16 dias de previsão, com UV e humidade."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            f"&current_weather=true"
            f"&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code,uv_index"
            f"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max"
            f"&timezone=auto&past_days=7&forecast_days=16"
        )
        r = requests.get(url, timeout=10)
        return r.json()
    except Exception as e:
        print(f"[WEATHER ERROR] {e}")
    return None

def get_current_humidity(weather_data):
    """Obtém a humidade relativa da hora atual."""
    try:
        now_str = weather_data["current_weather"]["time"]
        times = weather_data["hourly"]["time"]
        for i, t in enumerate(times):
            if t == now_str:
                return weather_data["hourly"]["relative_humidity_2m"][i]
    except: pass
    return None

def get_current_uv(weather_data):
    """Obtém o índice UV da hora atual."""
    try:
        now_str = weather_data["current_weather"]["time"]
        times = weather_data["hourly"]["time"]
        for i, t in enumerate(times):
            if t == now_str:
                return weather_data["hourly"]["uv_index"][i]
    except: pass
    return None

def format_current(weather_data, city_name):
    """Formata dados meteorológicos atuais, incluindo humidade e UV."""
    cw = weather_data["current_weather"]
    desc = WMO_CODES.get(cw["weathercode"], "Desconhecido")
    humidity = get_current_humidity(weather_data)
    uv = get_current_uv(weather_data)
    parts = [
        f"Agora em {city_name}: {cw['temperature']}°C, {desc}",
        f"vento a {cw['windspeed']} km/h",
    ]
    if humidity is not None:
        parts.append(f"humidade {humidity}%")
    if uv is not None:
        parts.append(f"índice UV {uv}")
    return ", ".join(parts) + "."

def format_daily(weather_data, city_name, day_index, day_label):
    """Formata dados para um dia específico, incluindo UV máximo."""
    daily = weather_data["daily"]
    if day_index >= len(daily["time"]):
        return f"Não tenho dados de previsão para esse dia em {city_name}."
    desc = WMO_CODES.get(daily["weather_code"][day_index], "Desconhecido")
    uv_max = daily.get("uv_index_max", [None])
    uv_str = ""
    if day_index < len(uv_max) and uv_max[day_index] is not None:
        uv_str = f", índice UV máximo {uv_max[day_index]}"
    return (
        f"{day_label} ({daily['time'][day_index]}) em {city_name}: "
        f"Máxima {daily['temperature_2m_max'][day_index]}°C, "
        f"Mínima {daily['temperature_2m_min'][day_index]}°C, "
        f"{daily['precipitation_probability_max'][day_index]}% probabilidade de chuva, "
        f"{desc}{uv_str}."
    )

def format_hourly(weather_data, city_name, target_datetime_str):
    """Formata dados para uma hora específica, incluindo humidade e UV."""
    hourly = weather_data["hourly"]
    times = hourly["time"]
    for i, t in enumerate(times):
        if t == target_datetime_str:
            desc = WMO_CODES.get(hourly["weather_code"][i], "Desconhecido")
            humidity = hourly["relative_humidity_2m"][i]
            uv = hourly.get("uv_index", [None])
            uv_val = uv[i] if i < len(uv) and uv[i] is not None else None
            parts = [
                f"Em {city_name} às {t.split('T')[1]}h de {t.split('T')[0]}",
                f"{hourly['temperature_2m'][i]}°C",
                f"humidade {humidity}%",
                f"{hourly['precipitation_probability'][i]}% probabilidade de chuva",
                f"vento a {hourly['wind_speed_10m'][i]} km/h",
                f"{desc}",
            ]
            if uv_val is not None:
                parts.append(f"índice UV {uv_val}")
            return ": " + ", ".join(parts[1:]) + ". " + parts[0] + "."
    return None

def perguntar_ao_agente(pergunta, historico=None, model_name="llama3"):
    """Motor principal do MeteoBot."""
    if historico is None:
        historico = []

    llm = Ollama(model=model_name, temperature=0.1)
    now = datetime.now()

    # --- PASSO 1: Usar o LLM para entender a pergunta ---
    hist_context = ""
    for msg in historico[-4:]:
        hist_context += f"{msg['role']}: {msg['content']}\n"

    extraction_prompt = f"""Analisa a pergunta do utilizador e extrai:
1. A cidade/localidade mencionada (se não estiver na pergunta, procura no histórico)
2. O período temporal: "agora", "hoje", "amanhã", "ontem", ou uma data específica no formato "YYYY-MM-DD"
3. O dia se mencionado com hora (ex: "amanhã às 15h" → dia="amanhã", hora="15:00")
4. Se mencionarem uma data como "dia 10 de maio", converte para "2026-05-10"
5. Se mencionarem "próxima segunda" ou "daqui a 3 dias", calcula a data a partir de hoje ({now.strftime('%Y-%m-%d')})

Responde APENAS com JSON válido, sem mais texto.
Formato: {{"cidade": "nome", "dia": "agora/hoje/amanhã/ontem/YYYY-MM-DD", "hora": null ou "HH:00"}}

Histórico:
{hist_context}

Pergunta: {pergunta}
JSON:"""

    cidade = None
    dia = "agora"
    hora = None

    try:
        raw = llm.invoke(extraction_prompt)
        # Extrair JSON da resposta (mesmo que tenha texto extra)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(raw[start:end])
            cidade = parsed.get("cidade")
            dia = parsed.get("dia", "agora")
            hora = parsed.get("hora")
    except Exception as e:
        print(f"[LLM PARSE ERROR] {e}")

    # Se o LLM não conseguiu extrair a cidade, retorna uma resposta genérica
    if not cidade:
        return llm.invoke(f"És um assistente de meteorologia. Responde brevemente em Português de Portugal: {pergunta}")

    # --- PASSO 2: Geocoding ---
    geo = geocode(cidade)
    if not geo:
        return f"Não encontrei a localidade '{cidade}'. Tenta com o nome completo da cidade ou freguesia."

    # --- PASSO 3: Buscar dados meteorológicos ---
    weather = fetch_weather(geo["lat"], geo["lon"])
    if not weather:
        return f"Erro ao obter dados meteorológicos para {geo['name']}. Tenta novamente."

    # --- PASSO 4: Formatar a resposta com base no período pedido ---
    nome = geo["name"]
    daily_dates = weather.get("daily", {}).get("time", [])

    # Helper: resolver a data-alvo para um índice no array daily
    def resolve_date(dia_str):
        """Converte o dia extraído pelo LLM num target_date e day_index."""
        if dia_str == "ontem":
            td = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        elif dia_str in ("amanhã", "amanha"):
            td = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        elif dia_str == "hoje":
            td = now.strftime("%Y-%m-%d")
        elif dia_str == "agora":
            td = now.strftime("%Y-%m-%d")
        else:
            # Assumir que é uma data no formato YYYY-MM-DD
            td = dia_str
        
        # Encontrar o índice no array daily
        if td in daily_dates:
            return td, daily_dates.index(td)
        return td, None

    target_date, day_index = resolve_date(dia)

    # Determinar que dados apresentar
    if hora:
        # Pediu uma hora específica
        hora_clean = hora.replace("h", ":00").replace("H", ":00")
        if ":" not in hora_clean:
            hora_clean = hora_clean + ":00"
        hora_parts = hora_clean.split(":")
        hora_formatted = f"{int(hora_parts[0]):02d}:00"
        target_dt = f"{target_date}T{hora_formatted}"
        
        resultado = format_hourly(weather, nome, target_dt)
        if resultado:
            dados_meteo = resultado
        else:
            dados_meteo = f"Não tenho dados para {nome} nesse horário específico ({target_dt})."
    
    elif dia == "ontem":
        if day_index is not None:
            dados_meteo = format_daily(weather, nome, day_index, "Ontem")
        else:
            dados_meteo = f"Não tenho dados de ontem para {nome}."
    
    elif dia in ("amanhã", "amanha"):
        if day_index is not None:
            dados_meteo = format_daily(weather, nome, day_index, "Amanhã")
        else:
            dados_meteo = f"Não tenho previsão para amanhã em {nome}."
    
    elif dia == "hoje":
        dados_meteo = format_current(weather, nome)
        if day_index is not None:
            dados_meteo += "\n" + format_daily(weather, nome, day_index, "Hoje")
    
    elif day_index is not None:
        # Data específica (ex: 2026-05-10)
        dados_meteo = format_daily(weather, nome, day_index, f"Dia {target_date}")
    
    elif dia != "agora":
        # Data fora do alcance
        dados_meteo = f"Não tenho previsão para {dia} em {nome}. Apenas consigo prever até 16 dias."
    
    else:  # "agora" ou default
        dados_meteo = format_current(weather, nome)

    # --- PASSO 5: Resposta final natural via LLM ---
    final_prompt = f"""Dados meteorológicos reais:
{dados_meteo}

Pergunta original: {pergunta}

Instrução: Reformula os dados acima numa resposta curta e natural em Português de Portugal. 
Usa APENAS os dados fornecidos. Não inventes informação. Não faças introduções longas."""

    try:
        return llm.invoke(final_prompt)
    except:
        # Se o LLM falhar, devolve os dados crus (que já estão formatados)
        return dados_meteo


if __name__ == "__main__":
    print("=== Teste 1: Tempo agora ===")
    print(perguntar_ao_agente("Como está o tempo em Braga?"))
    print("\n=== Teste 2: Amanhã ===")
    print(perguntar_ao_agente("Como vai estar o tempo no Porto amanhã?"))
    print("\n=== Teste 3: Hora específica ===")
    print(perguntar_ao_agente("Que temperatura vai estar em Lisboa amanhã às 15h?"))
